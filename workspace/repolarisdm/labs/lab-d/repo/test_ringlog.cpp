// Test driver for ringlog. Prints PASS or FAIL per test; exits 1 if any fail.
#include <cstdio>
#include <stdexcept>
#include <string>

#include "ringlog.h"

namespace {

using ringlog::Level;
using ringlog::RingLog;

#define CHECK(cond)                                                              \
  do {                                                                           \
    if (!(cond)) {                                                               \
      std::printf("  check failed: %s (%s:%d)\n", #cond, __FILE__, __LINE__);    \
      ok = false;                                                                \
    }                                                                            \
  } while (0)

bool test_starts_empty() {
  bool ok = true;
  RingLog log(4, 16);
  CHECK(log.size() == 0);
  CHECK(log.capacity() == 4);
  CHECK(log.dropped() == 0);
  CHECK(log.dump().empty());
  return ok;
}

bool test_push_and_read() {
  bool ok = true;
  RingLog log(4, 16);
  log.push(Level::kInfo, "hello");
  log.push(Level::kWarn, "disk at 91%");
  CHECK(log.size() == 2);
  CHECK(log.at(0).seq == 1);
  CHECK(log.at(0).text == "hello");
  CHECK(log.at(0).level == Level::kInfo);
  CHECK(log.at(1).seq == 2);
  CHECK(log.at(1).text == "disk at 91%");
  CHECK(log.at(1).level == Level::kWarn);
  return ok;
}

bool test_overwrites_oldest_when_full() {
  bool ok = true;
  RingLog log(3, 8);
  for (const char* m : {"m1", "m2", "m3", "m4", "m5"}) log.push(Level::kInfo, m);
  CHECK(log.size() == 3);
  CHECK(log.dropped() == 2);
  CHECK(log.at(0).text == "m3");
  CHECK(log.at(0).seq == 3);
  CHECK(log.at(2).text == "m5");
  CHECK(log.at(2).seq == 5);
  return ok;
}

bool test_truncates_long_messages() {
  bool ok = true;
  RingLog log(2, 8);
  log.push(Level::kError, "0123456789");
  log.push(Level::kError, "abcdefgh");  // exactly max_text bytes
  CHECK(log.at(0).text == "01234567");
  CHECK(log.at(0).text.size() == 8);
  CHECK(log.at(1).text == "abcdefgh");
  return ok;
}

bool test_dump_format() {
  bool ok = true;
  RingLog log(3, 32);
  log.push(Level::kInfo, "boot");
  log.push(Level::kError, "fan stopped");
  CHECK(log.dump() == "1 INFO boot\n2 ERROR fan stopped\n");
  return ok;
}

bool test_empty_message() {
  bool ok = true;
  RingLog log(2, 8);
  log.push(Level::kDebug, "");
  CHECK(log.at(0).text.empty());
  CHECK(log.dump() == "1 DEBUG \n");
  return ok;
}

bool test_at_out_of_range_throws() {
  bool ok = true;
  RingLog log(2, 8);
  log.push(Level::kInfo, "x");
  bool threw = false;
  try {
    log.at(1);
  } catch (const std::out_of_range&) {
    threw = true;
  }
  CHECK(threw);
  return ok;
}

bool test_rejects_zero_sizes() {
  bool ok = true;
  int threw = 0;
  try {
    RingLog bad(0, 8);
  } catch (const std::invalid_argument&) {
    ++threw;
  }
  try {
    RingLog bad(2, 0);
  } catch (const std::invalid_argument&) {
    ++threw;
  }
  CHECK(threw == 2);
  return ok;
}

bool test_many_pushes() {
  bool ok = true;
  RingLog log(4, 16);
  char text[16];
  for (int i = 1; i <= 1000; ++i) {
    std::snprintf(text, sizeof text, "event %d", i);
    log.push(Level::kInfo, text);
  }
  CHECK(log.size() == 4);
  CHECK(log.dropped() == 996);
  CHECK(log.at(0).text == "event 997");
  CHECK(log.at(3).seq == 1000);
  CHECK(log.at(3).text == "event 1000");
  return ok;
}

struct Test {
  const char* name;
  bool (*fn)();
};

const Test kTests[] = {
    {"starts_empty", test_starts_empty},
    {"push_and_read", test_push_and_read},
    {"overwrites_oldest_when_full", test_overwrites_oldest_when_full},
    {"truncates_long_messages", test_truncates_long_messages},
    {"dump_format", test_dump_format},
    {"empty_message", test_empty_message},
    {"at_out_of_range_throws", test_at_out_of_range_throws},
    {"rejects_zero_sizes", test_rejects_zero_sizes},
    {"many_pushes", test_many_pushes},
};

}  // namespace

int main() {
  int failed = 0;
  int total = 0;
  for (const Test& t : kTests) {
    bool ok = false;
    try {
      ok = t.fn();
    } catch (const std::exception& e) {
      std::printf("  unexpected exception: %s\n", e.what());
    }
    std::printf("%s %s\n", ok ? "PASS" : "FAIL", t.name);
    std::fflush(stdout);  // keep the output if a sanitizer stops the program
    failed += ok ? 0 : 1;
    ++total;
  }
  std::printf("%d tests, %d failed\n", total, failed);
  return failed == 0 ? 0 : 1;
}
