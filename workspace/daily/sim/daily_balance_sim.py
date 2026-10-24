"""Monte Carlo balance simulation for the Daily pet game (v2 rules).

Models a greedy "climber" policy (always pushes the highest tier) so results are an
upper bound on progression speed: if this player can't reach Ultra in a year, nobody can.

Run:  python3 daily_balance_sim.py [runs]      (default 400 runs per player type)
Port this to the engine's language and keep it as a script: re-run it whenever a number changes.

Difficulty is a day level (Chill/Easy/Medium/Hard for the whole list) with optional per-task raises
(max 2 Goddamn), a +20% commitment bonus on finished days, and a soft cap (food above 1,200 a day
counts half).

Targets (year 1): Mythic is lucky (about 7-9% on Chill/Easy days, about 30% on Medium days, about 50%
for Medium weekdays + Hard weekends); Ultra <= ~1% for realistic play, a few percent even at Hard every
day. Everyone consistent can save diamonds for an Epic egg within a year (bad-luck safety net).
"""
import random
import statistics
import sys
from collections import Counter

TIER_NAMES = ["Ordinary", "Rare", "Super Rare", "Epic", "Mythic", "Legendary", "Ultra"]
U = 6  # Ultra index


def default_params():
    return dict(
        F=30,                       # base food unit for a 6-task list (all-Easy day = 360)
        mult={"C": 1, "E": 2, "M": 4, "H": 12, "G": 50},
        pet_need=100,
        upkeep=10,
        backpack_cap=12,
        meter=[200, 600, 1800, 5400, 16200, 48600, 145800],          # x3 per tier
        p_laid=[0.35, 0.25, 0.12, 0.05, 0.035, 0.03, 0.03],          # pet-egg chance, egg a pet laid
        p_streak=[0.10, 0.05, 0.02, 0.01, 0.01, 0.01, 0.01],         # streak / quest / season eggs
        split=[(0.825, 0.125, 0.05), (0.825, 0.125, 0.05), (0.88, 0.10, 0.02),
               (0.92, 0.07, 0.01), (0.94, 0.05, 0.01), (0.75, 0.25, 0.0), (1.0, 0.0, 0.0)],
        streak_split=[(0.9, 0.1, 0.0)] * 6 + [(1.0, 0.0, 0.0)],    # never +2 from streak eggs
        servings=[5, 6, 8, 10, 12, 15, 20],
        hatch_up=0.05,
        floor=0.50,
        charm_p=0.20,
        charm_drop=[0, 0, 0, 0.3, 0.5, 0.7, 1.0],                    # charms only from Epic+ eggs
        merge_mut=0.05,
        combine=[0.20, 0.10, 0.05, 0.025, 0.0125, 0.00625],
        freeze_cap=3,
        freeze_price=600,
        charm_price=60,             # diamonds
        shop_pets={},
        shop_eggs={3: 250, 4: 2000, 5: 10000},                       # tier -> diamond price
        quest_coins=60,             # daily quests + Keeper road, per complete day (approx.)
        quest_dia=0.4,
        commit_bonus=0.20,          # +20% food when the day is finished at or above the morning's day level
        daily_food_cap=1200,        # soft cap: food beyond this in one day counts at cap_rate
        cap_rate=0.5,
        div_coins=[5, 10, 20, 40, 80, 160, 320],
        div_dia=[0, 0, 0, 0.2, 0.5, 1.0, 3.0],
        loot_coins=[10, 20, 35, 60, 100, 160, 250],
        loot_dia=[1, 1, 2, 3, 5, 8, 12],
        separate_yield=[3, 4, 5, 6, 8, 10, 12],
        phoenix=True,               # revival quest after a death
        pity=None,                  # e.g. 40 -> guaranteed +1 pet egg after 40 eggs without one
        days=365,
    )


ARCHETYPES = {
    # Day levels: one level for the whole list each day (C/E/M/H), plus optional per-task raises
    # (a G means a task raised to Goddamn, max 2 a day).
    # name: (weekday mix, weekend mix, p_miss_after_complete, p_miss_after_miss)
    "chill-days":        ("CCCCCC", "CCCCCC", 0.02, 0.30),
    "easy-days":         ("EEEEEE", "EEEEEE", 0.03, 0.40),
    "medium-days":       ("MMMMMM", "MMMMMM", 0.03, 0.40),
    "medium+hard-wkend": ("MMMMMM", "HHHHHH", 0.03, 0.40),
    "hard-every-day":    ("HHHHHH", "GGHHHH", 0.04, 0.40),
    "inconsistent":      ("MMMMMM", "MMMMMM", 0.10, 0.50),
}


def items_in_egg(rng):
    return 3 + sum(1 for _ in range(9) if rng.random() < 0.28)


def streak_bonus(s):
    """(tier, count) of openable eggs paid on a complete day with streak s."""
    if s in (10, 100, 1000):
        tier = {10: 1, 100: 2, 1000: 3}[s]
        return tier, random.randint(5, 10)
    if s < 10:
        lo, hi, tier = 1, 9, 0
    elif s < 100:
        lo, hi, tier = 10, 99, 1
    elif s < 1000:
        lo, hi, tier = 100, 999, 2
    else:
        lo, hi, tier = 1000, 9999, 3
    L = hi - lo + 1
    return tier, 1 + (3 * (s - lo)) // L


class Player:
    def __init__(self, P, arche, rng):
        self.P, self.rng = P, rng
        self.wk, self.we, self.p_mc, self.p_mm = ARCHETYPES[arche]
        self.pets = [[0, rng.randrange(6), 1]]      # [tier, species, stars]
        self.eggs = []                               # pet eggs (tiers)
        self.food = [0] * 7                          # egg-food servings by tier
        self.coins = 0
        self.dia = 0.0
        self.charms = 0
        self.freezes = 0
        self.meter = 0
        self.meter_tier = 0
        self.streak = 0
        self.miss_run = 0
        self.prev_complete = True
        self.deaths = 0
        self.ashes = None            # (pet, deadline_day, progress)
        self.first = {}              # tier -> first day reached
        self.opened = 0
        self.pet_eggs_got = 0
        self.pity = 0
        self.max_streak = 0
        self.coin_income = 0
        self.dia_income = 0.0
        self.shop_buys = 0
        self.hungry = 0
        self.starving = 0

    # ---------- helpers
    def max_tier(self):
        return max((p[0] for p in self.pets), default=-1)

    def note_tiers(self, day):
        for p in self.pets:
            t = p[0]
            for k in range(t + 1):
                self.first.setdefault(k, day)

    def day_food(self, mix, done_frac=1.0):
        P = self.P
        tasks = list(mix)
        if done_frac < 1.0:
            k = self.rng.randint(0, len(tasks) - 1)
            self.rng.shuffle(tasks)
            tasks = tasks[:k]
        food = sum(P["F"] * P["mult"][t] for t in tasks)
        if done_frac >= 1.0:
            food = int(food * (1 + P.get("commit_bonus", 0)))
        cap = P.get("daily_food_cap")
        if cap and food > cap:
            food = int(cap + (food - cap) * P.get("cap_rate", 0.5))
        return food

    # ---------- eggs
    def open_egg(self, tier, laid):
        P, rng = self.P, self.rng
        self.opened += 1
        n = items_in_egg(rng)
        p_pet = (P["p_laid"][tier] if isinstance(P["p_laid"], list) else P["p_laid"]) if laid else (P["p_streak"][tier] if isinstance(P["p_streak"], list) else P["p_streak"])
        split = P["split"] if (laid or P["streak_split"] is None) else P["streak_split"]
        got_up = False
        if rng.random() < p_pet:
            n -= 1
            a, b, c = split[tier]
            r = rng.random() * (a + b + c)
            t = tier if r < a else (tier + 1 if r < a + b else tier + 2)
            t = min(U, t)
            if P["pity"] and self.pity >= P["pity"] and t == tier and tier < U:
                t = tier + 1
            got_up = t > tier
            self.eggs.append(t)
            self.pet_eggs_got += 1
        if P["pity"]:
            self.pity = 0 if got_up else self.pity + 1
        for _ in range(n):
            r = rng.random()
            if r < 0.35:
                q = rng.random()
                ft = tier if q < 0.70 else (max(0, tier - 1) if q < 0.95 else min(U, tier + 1))
                self.food[ft] += rng.randint(1, 3)
            elif r < 0.75:
                c = int(P["loot_coins"][tier] * rng.uniform(0.5, 1.5))
                self.coins += c
                self.coin_income += c
            elif r < 0.83:
                self.dia += P["loot_dia"][tier]
                self.dia_income += P["loot_dia"][tier]
            elif r < 0.95:
                pass  # XP treat (not modelled in tier race)
            elif r < 0.98:
                if rng.random() < P.get("charm_drop", [1]*7)[tier]:
                    self.charms += 1
            else:
                pass  # trinket / coins

    def hatch_odds(self, egg_tier, food_tiers):
        P = self.P
        probs = [0.0] * 7
        probs[egg_tier] = 1 - P["hatch_up"]
        if egg_tier < U:
            probs[egg_tier + 1] += P["hatch_up"]
        else:
            probs[egg_tier] = 1.0
        bonus = [0.0] * 7
        for f in food_tiers:
            k = f - egg_tier
            for j in range(1, k + 1):
                bonus[min(U, egg_tier + j)] += 0.01 / (2 ** (j - 1))
        total_bonus = sum(bonus)
        room = probs[egg_tier] - P["floor"]
        if egg_tier < U and total_bonus > 0:
            scale = min(1.0, room / total_bonus) if total_bonus > room else 1.0
            for t in range(7):
                if t != egg_tier:
                    probs[t] += bonus[t] * scale
            probs[egg_tier] -= total_bonus * scale
        return probs

    def try_hatch(self, egg_tier):
        P, rng = self.P, self.rng
        use_charm = self.charms > 0 and egg_tier >= 2
        need = P["servings"][egg_tier] * (1.5 if use_charm else 1.0)
        need = int(round(need))
        if sum(self.food) < need:
            return False
        picked = []
        for t in range(U, -1, -1):
            while self.food[t] > 0 and len(picked) < need:
                self.food[t] -= 1
                picked.append(t)
        probs = self.hatch_odds(egg_tier, picked)
        r, acc, out = rng.random(), 0.0, egg_tier
        for t in range(7):
            acc += probs[t]
            if r < acc:
                out = t
                break
        if use_charm:
            self.charms -= 1
            if rng.random() < P["charm_p"]:
                out = min(U, out + 1)
        self.pets.append([out, rng.randrange(6), 1])
        return True

    def manage_eggs(self):
        P, rng = self.P, self.rng
        mt = max(0, self.max_tier())
        keep = []
        self.eggs.sort(reverse=True)
        low = Counter()
        for t in self.eggs:
            if t >= max(1, mt - 1) or t >= 2:
                if not self.try_hatch(t):
                    keep.append(t)
            else:
                low[t] += 1
        for t, n in low.items():
            while n >= 2:
                n -= 2
                if rng.random() < P["combine"][t]:
                    keep.append(t + 1)
            if n == 1:
                self.food[t] += P["separate_yield"][t]
        self.eggs = keep

    def manage_pets(self):
        P, rng = self.P, self.rng
        changed = True
        while changed:
            changed = False
            groups = {}
            for i, p in enumerate(self.pets):
                if p[2] < 5:
                    groups.setdefault((p[0], p[1], p[2]), []).append(i)
            for key, idx in groups.items():
                if len(idx) >= 2:
                    a, b = idx[0], idx[1]
                    t, s, st = self.pets[a]
                    if rng.random() < P["merge_mut"] and t < U:
                        t += 1
                    self.pets[a] = [t, s, st + 1]
                    self.pets.pop(b)
                    changed = True
                    break
        # combine surplus low pets (keep the best 3 of each tier below max)
        mt = self.max_tier()
        by_tier = {}
        for p in self.pets:
            by_tier.setdefault(p[0], []).append(p)
        new = []
        for t, lst in by_tier.items():
            if t >= mt or t >= U:
                new.extend(lst)
                continue
            lst.sort(key=lambda p: -p[2])
            keepers, extra = lst[:3], lst[3:]
            new.extend(keepers)
            while len(extra) >= 2:
                a, b = extra.pop(), extra.pop()
                if rng.random() < P["combine"][t]:
                    new.append([t + 1, rng.choice([a[1], b[1]]), 1])
            new.extend(extra)
        self.pets = new
        # enforce backpack cap (active 3 + backpack cap): drop lowest
        cap = 3 + P["backpack_cap"]
        if len(self.pets) > cap:
            self.pets.sort(key=lambda p: (p[0], p[2]), reverse=True)
            self.pets = self.pets[:cap]

    # ---------- day
    def active_pets(self, food_est):
        self.pets.sort(key=lambda p: (p[0], p[2]), reverse=True)
        n_afford = max(1, int(food_est // self.P["pet_need"]))
        return self.pets[:min(3, n_afford)]

    def death(self):
        P, rng = self.P, self.rng
        self.deaths += 1
        self.pets.sort(key=lambda p: (p[0], p[2]), reverse=True)
        dead, rest = self.pets[:3], self.pets[3:]
        rng.shuffle(rest)
        rest = rest[: len(rest) - len(rest) // 2]
        self.pets = rest
        rng.shuffle(self.eggs)
        self.eggs = self.eggs[: len(self.eggs) - len(self.eggs) // 2]
        self.food = [f - f // 2 for f in self.food]
        self.coins -= self.coins // 2
        self.dia -= self.dia / 2
        self.charms -= self.charms // 2
        if dead and P["phoenix"]:
            self.ashes = [max(dead, key=lambda p: (p[0], p[2])), 7, 0]
        if not self.pets:
            self.eggs.append(0)
        self.meter = 0

    def step(self, day):
        P, rng = self.P, self.rng
        weekend = day % 7 in (5, 6)
        mix = self.we if weekend else self.wk
        p_miss = self.p_mc if self.prev_complete else self.p_mm
        complete = rng.random() >= p_miss
        self.prev_complete = complete
        food = self.day_food(mix, 1.0 if complete else 0.5)

        if complete:
            self.streak += 1
            self.max_streak = max(self.max_streak, self.streak)
            self.miss_run = 0
            self.coins += P.get("quest_coins", 0); self.coin_income += P.get("quest_coins", 0)
            self.dia += P.get("quest_dia", 0); self.dia_income += P.get("quest_dia", 0)
            tier, cnt = streak_bonus(self.streak)
            for _ in range(cnt):
                self.open_egg(tier, laid=False)
            if self.ashes:
                self.ashes[2] += 1
                if self.ashes[2] >= 3:
                    self.pets.append(self.ashes[0])
                    self.ashes = None
        else:
            if self.freezes > 0:
                self.freezes -= 1
            else:
                self.streak = 0
                self.miss_run += 1
                if self.miss_run == 1: self.hungry += 1
                if self.miss_run == 2: self.starving += 1
                if self.ashes:
                    self.ashes[2] = 0
                if self.miss_run >= 3:
                    self.death()
                    self.miss_run = 0
        if self.ashes:
            self.ashes[1] -= 1
            if self.ashes[1] <= 0:
                self.ashes = None

        if not self.pets:
            self.manage_eggs()
        backpack = max(0, len(self.pets) - 3)
        upkeep = min(backpack, P["backpack_cap"]) * P["upkeep"]
        active = self.active_pets(self.day_food(mix) - upkeep)
        need = P["pet_need"] * len(active) + upkeep
        excess = food - need
        if active:
            top = active[0]
            if top[0] != self.meter_tier:
                self.meter_tier, self.meter = top[0], 0
            if excess > 0:
                self.meter += excess
                while self.meter >= P["meter"][top[0]]:
                    self.meter -= P["meter"][top[0]]
                    self.open_egg(top[0], laid=True)
            fed = min(len(active), max(0, food - upkeep) // P["pet_need"])
            for p in active[: int(fed)]:
                c = P["div_coins"][p[0]]
                self.coins += c
                self.coin_income += c
                self.dia += P["div_dia"][p[0]]
                self.dia_income += P["div_dia"][p[0]]

        self.manage_eggs()
        self.manage_pets()

        # shop
        while self.freezes < P["freeze_cap"] and self.coins >= P["freeze_price"]:
            self.coins -= P["freeze_price"]
            self.freezes += 1
        mt = max(self.max_tier(), max(self.eggs, default=-1))
        for t, price in sorted(P.get("shop_eggs", {}).items()):
            if mt < t and self.dia >= price:
                self.dia -= price
                self.eggs.append(t)
                self.shop_buys += 1
                mt = t
        if mt >= 4:
            while self.dia >= P["charm_price"] + 400:
                self.dia -= P["charm_price"]
                self.charms += 1
        self.note_tiers(day)


def run(arche, P, runs=1000, seed=1):
    rng = random.Random(seed)
    random.seed(seed + 99)
    days = P["days"]
    res = []
    for _ in range(runs):
        pl = Player(P, arche, rng)
        for d in range(1, days + 1):
            pl.step(d)
        res.append(pl)
    out = {"arche": arche}
    for t in (3, 4, 5, 6):
        days_hit = [p.first[t] for p in res if t in p.first]
        out[TIER_NAMES[t]] = (len(days_hit) / runs, statistics.median(days_hit) if days_hit else None)
    out["deaths/yr"] = statistics.mean(p.deaths for p in res) * 365 / days
    out["P(death)"] = sum(1 for p in res if p.deaths > 0) / runs
    out["eggs/day"] = statistics.mean(p.opened for p in res) / days
    out["petEggs/mo"] = statistics.mean(p.pet_eggs_got for p in res) / days * 30
    out["coins/day"] = statistics.mean(p.coin_income for p in res) / days
    out["dia/day"] = statistics.mean(p.dia_income for p in res) / days
    out["maxStreak"] = statistics.median(p.max_streak for p in res)
    return out


def report(P, runs=600, label=""):
    print(f"\n=== {label}  (days={P['days']}, runs={runs}) ===")
    hdr = f"{'player':<14}{'Epic':>14}{'Mythic':>14}{'Legend':>14}{'Ultra':>14}{'deaths/yr':>10}{'P(death)':>9}{'eggs/d':>7}{'pEgg/mo':>8}{'coin/d':>7}{'dia/d':>6}"
    print(hdr)
    for a in ARCHETYPES:
        o = run(a, P, runs)

        def f(x):
            p, m = x
            return f"{p*100:5.1f}% d{int(m) if m else '-':>4}"
        print(f"{a:<14}{f(o['Epic']):>14}{f(o['Mythic']):>14}{f(o['Legendary']):>14}{f(o['Ultra']):>14}"
              f"{o['deaths/yr']:>10.2f}{o['P(death)']*100:>8.0f}%{o['eggs/day']:>7.1f}{o['petEggs/mo']:>8.1f}{o['coins/day']:>7.0f}{o['dia/day']:>6.1f}")


if __name__ == "__main__":
    P = default_params()
    report(P, runs=int(sys.argv[1]) if len(sys.argv) > 1 else 400, label="v2 final")
