# Colab GPU labs: verified facts (checked 2026-10-20)

Input file for the agents that write `labs/colab/*.ipynb` and Chapter 15. It is not a playbook page.
Every fact was checked on **2026-10-20**. Nothing here was run on a GPU, because the build machine has no GPU.

Status words:
- **confirmed**: primary source read. That means official docs, source code at a pinned tag, PyPI JSON, the Hugging Face Hub API, or the paper itself.
- **reported**: a secondary source (a blog or third-party site) says it.
- **inference**: our reasoning from confirmed facts. Not tested.
- **uncertain**: sources conflict, or nothing could be verified.

---

## 0. Pin table (use these unless a notebook needs otherwise)

| Package | Latest on PyPI (upload date) | Preinstalled in Colab GPU image | Recommended pin | Status |
|---|---|---|---|---|
| vllm | 0.32.0 (2026-10-18); 0.31.0 (2026-10-05) | not installed | `vllm==0.31.0` (one pin set for all notebooks, works with TRL); `0.32.0` only if a notebook does not use TRL | confirmed versions; choice is inference |
| torch | 2.14.1 (2026-09-30) | 2.11.0+cu130 | let vLLM pull its pin: `torch==2.13.0` (both vLLM 0.31.0 and 0.32.0 pin it) | confirmed |
| transformers | 5.20.2 (2026-10-19) | 5.20.2 | `transformers==5.17.0` with vllm 0.31.0 (it needs `>=5.10.4,<5.18.0`); `5.19.0` with vllm 0.32.0 (it needs `>=5.16.1,<5.20.0`); keep 5.20.2 when no vLLM | confirmed constraints |
| trl | 1.16.0 (2026-10-15) | not installed | `trl==1.16.0` (Python >=3.11; its `[vllm]` extra needs `vllm>=0.22.0,<=0.31.0`) | confirmed |
| peft | 0.21.2 (2026-10-01) | 0.21.2 | `peft==0.21.2` | confirmed |
| accelerate | 1.15.0 (2026-09-09) | 1.15.0 | `accelerate==1.15.0` | confirmed |
| datasets | 5.1.0 (2026-10-05) | 4.8.5 | keep 4.8.5 (TRL needs >=4.7.0) | confirmed |
| bitsandbytes | 0.50.2 (2026-08-27) | (not checked) | `bitsandbytes==0.50.2`, only if you use QLoRA | confirmed version |
| mini-swe-agent | 2.4.6 (2026-07-23) | not installed | `mini-swe-agent==2.4.6` (optional) | confirmed |
| scikit-learn | 1.9.1 | (not checked) | only for `cohen_kappa_score`; a stdlib version is easy to write | confirmed version |

Sources:
- PyPI JSON: https://pypi.org/pypi/vllm/json, https://pypi.org/pypi/trl/json, https://pypi.org/pypi/transformers/json, https://pypi.org/pypi/peft/json, https://pypi.org/pypi/torch/json, https://pypi.org/pypi/mini-swe-agent/json. Pins come from `requires_dist`, and https://pypi.org/pypi/vllm/0.31.0/json was read for the 0.31.0 pins. Checked 2026-10-20.
- Colab image: https://github.com/googlecolab/backend-info, files `pip-freeze.gpu.txt`, `os-info-gpu.txt` and `apt-list-gpu.txt`, latest commit 2026-10-20. Checked 2026-10-20.

Install facts for notebooks:
- Installing vLLM **replaces Colab's torch** (2.11.0 becomes 2.13.0), and also torchvision, torchaudio and torchcodec. It downgrades transformers. You must **restart the session** after the install cell. This is inference from the pins; the pins themselves are confirmed. A common pattern is an install cell that ends with `import os; os.kill(os.getpid(), 9)`, with the user then running the cells below it. That pattern is inference and was not tested in Colab.
- vLLM's docs say to run `vllm download-kernels` after every install. It fetches FlashInfer kernels. **confirmed** at https://raw.githubusercontent.com/vllm-project/vllm/v0.32.0/docs/getting_started/installation/gpu.cuda.inc.md (2026-10-20). FlashInfer is not used for attention on T4 (see §2), so this matters mostly on L4 and newer (inference).
- Version numbers released in the last few days (vllm 0.32.0, transformers 5.20.x) are the most likely to have bugs. Prefer vllm 0.31.0 and transformers 5.17.0 (inference).

---

## 1. Google Colab

### 1.1 GPU types, VRAM, bf16

| Colab name | Chip / arch | Compute capability | VRAM (nominal; usable per McCormick) | Native bf16 | Colab compute units per hour (reported, Mar 2026) | Plan |
|---|---|---|---|---|---|---|
| T4 | NVIDIA T4, Turing | 7.5 | 16 GB; ~15 GB usable | **No** (emulated only) | 1.19 | free and paid |
| L4 | NVIDIA L4, Ada Lovelace | 8.9 | 24 GB; ~22.5 GB usable | Yes (also FP8) | 1.71 | paid |
| A100 | NVIDIA A100, Ampere | 8.0 | 40 GB or 80 GB (80 GB picked with the High-RAM option) | Yes (no FP8) | 5.40 (40 GB), 7.52 (80 GB) | paid |
| H100 | NVIDIA H100, Hopper | 9.0 | 80 GB | Yes (also FP8) | unknown | paid; often not allocatable (reported) |
| G4 | RTX PRO 6000 Blackwell Server Edition | 12.0 | ~96 GB | Yes (also FP8/FP4) | 8.71 | paid |

- The GPU list (T4, L4, G4, H100, A100) is **confirmed** by Google's official Colab CLI README: https://github.com/googlecolab/google-colab-cli (README, "Instant VM Provisioning"; 2026-10-20). Its skill file says an unknown `--gpu` value silently falls back to A100, and a 400 error means your account has no entitlement for that GPU: https://github.com/googlecolab/google-colab-cli/blob/main/skills/colab-operator/SKILL.md (2026-10-20).
- Compute capabilities are **confirmed** from NVIDIA's table: https://developer.nvidia.com/cuda-gpus (2026-10-20).
- VRAM "usable" values, compute-unit rates, the High-RAM selection of the A100 80 GB, and "G4 = RTX PRO 6000, ~96 GB" are **reported** by Chris McCormick, "Colab GPUs Features & Pricing" (updated March 2026; rates checked 2026-03-10): https://mccormickml.com/2024/04/23/colab-gpus-features-and-pricing/ (read 2026-10-20).
- H100 or G4 often fails to allocate: **reported** in user reports summarized by search results, e.g. issues on https://github.com/googlecolab/google-colab-cli (2026-10-20). Treat this as **uncertain**.
- "Free tier = T4" is **reported** (McCormick). The official FAQ only says that free access to GPUs is "heavily restricted" and that GPU types vary over time: https://research.google.com/colaboratory/faq.html (2026-10-20). **confirmed** for the FAQ wording.
- bf16 per chip: compute capability 8.0 or higher means native bf16. That is the rule used by vLLM (`supported_dtypes` in `vllm/platforms/cuda.py` at v0.32.0) and by torch. **confirmed** at https://raw.githubusercontent.com/vllm-project/vllm/v0.32.0/vllm/platforms/cuda.py (2026-10-20).

**bf16 detection pitfall (important).** `torch.cuda.is_bf16_supported()` defaults to `including_emulation=True`. Below compute capability 8.0 it returns True if it can create a bf16 tensor, so it can say **True on a T4**. **confirmed** from torch 2.11 source: https://raw.githubusercontent.com/pytorch/pytorch/v2.11.0/torch/cuda/__init__.py (2026-10-20). That it really returns True on a Colab T4 is inference (not run).
- In notebooks, detect native bf16 with `torch.cuda.get_device_capability()[0] >= 8`, or with `torch.cuda.is_bf16_supported(including_emulation=False)`.
- Consequence: transformers' bf16 guard calls `torch.cuda.is_bf16_supported()`, so it may **not** stop `bf16=True` on a T4: https://raw.githubusercontent.com/huggingface/transformers/v5.20.2/src/transformers/utils/import_utils.py (2026-10-20). TRL's GRPOConfig defaults to `bf16=True` (§3). On a T4, set `bf16=False` explicitly (inference).

### 1.2 Session and time limits (official FAQ, confirmed 2026-10-20)

Source: https://research.google.com/colaboratory/faq.html
- Free tier: notebooks run "for at most 12 hours", depending on availability and usage. Runtimes time out when idle.
- Pro, Pro+ and Pay As You Go: also "in general" at most 12 hours. **Pro+ supports continuous execution for up to 24 hours** if you have enough compute units. Idle timeouts apply only after execution stops.
- Paid users whose compute units run out drop back to free-tier limits. Running out of units ends the backend.
- Colab does not publish idle-timeout lengths, maximum VM lifetime, or usage limits. They vary over time.
- Disallowed on managed runtimes (relevant here): web services "not related to interactive compute", and containerization used to get around the anti-abuse rules. So keep `vllm serve` on localhost, inside the VM, and never open a public tunnel (inference from the FAQ).
- Docker is not available in Colab runtimes: **inference / reported**, not checked on a VM. For Harbor-style tasks, run `tests/test.sh` directly in a temp dir, without Docker (inference).

### 1.3 Prices (uncertain; they vary by country)

- Pro about $9.99/month (100 compute units). Pro+ about $49.99/month (500 or 600 units; sources conflict). Pay As You Go about $9.99 per 100 units. Compute units expire after 90 days. **reported**: https://mccormickml.com/2024/04/23/colab-gpus-features-and-pricing/, https://gpuperhour.com/blog/google-colab-alternatives (2026-10-20). The official page https://colab.research.google.com/signup renders only with JavaScript and could not be read. **uncertain**.

### 1.4 Current Colab GPU image (confirmed from googlecolab/backend-info, 2026-10-20)

Source: https://github.com/googlecolab/backend-info. The README warns that these files can be one or two days ahead of or behind production.
- Ubuntu 24.04.4 LTS, **Python 3.13.15**. Python changed from 3.12.13 to 3.13.15 in Aug 2026 (commit history of `os-info-gpu.txt`).
- torch 2.11.0+cu130, torchvision 0.26.0+cu130, triton 3.6.0, transformers 5.20.2, peft 0.21.2, accelerate 1.15.0, datasets 4.8.5, tokenizers 0.23.3, huggingface_hub 1.33.0, numpy 2.1.3, openai 2.54.0.
- apt: `cuda-compat-13-0` 580.126.20 and CUDA 13.0 toolkit pieces. Colab already ships torch built for CUDA 13, so CUDA-13 wheels (the default vLLM PyPI wheel, §2) should load (inference).
- Past runtime versions can be pinned. The build did not check where that setting sits in Colab's menus. The README lists **2026.07** (Python 3.12.13, PyTorch 2.11.0), 2026.04 and 2026.01, and links https://research.google.com/colaboratory/runtime-version-faq.html. Pinning 2026.07 is a fallback if Python 3.13 breaks something (inference).

### 1.5 Opening notebooks from GitHub (confirmed)

- URL format: `https://colab.research.google.com/github/<org>/<repo>/blob/<branch>/<path>.ipynb`. Public notebooks need no authorization. Remember the `blob`. Source: Google's demo notebook https://github.com/googlecolab/colabtools/blob/main/notebooks/colab-github-demo.ipynb (2026-10-20).
- Badge: `[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](<colab url>)` (same source).
- `ZelinZhu-Richard/ZelinZhu-Richard.github.io` is **public** and its default branch is `main` (GitHub API, 2026-10-20). `workspace/repolarisdm` does **not exist on `main` yet** (HTTP 404 on 2026-10-20). Every Colab link 404s until the build is pushed.
- Opening a notebook from GitHub gives an editable copy, and saving it requires File > Save a copy in Drive/GitHub. FAQ: "Edit > Notebook settings > Omit code cell output when saving this notebook" stops outputs from being saved. Both **confirmed** at https://research.google.com/colaboratory/faq.html and in the demo notebook (2026-10-20).
- Sparse clone inside Colab (inference, git syntax checked, not run):
  ```
  !git clone --depth 1 --filter=blob:none --sparse https://github.com/ZelinZhu-Richard/ZelinZhu-Richard.github.io repo && cd repo && git sparse-checkout set workspace/repolarisdm/labs
  %cd /content/repo/workspace/repolarisdm/labs
  ```
  Pitfall: `!cd` runs in a subshell and does not persist, so use `%cd` for later cells (inference; standard IPython behavior). In cone mode, the checkout also includes top-level files of the repo. That is harmless (inference).

### 1.6 Secrets (confirmed from source)

Source: https://raw.githubusercontent.com/googlecolab/colabtools/main/google/colab/userdata.py (last changed 2024-07-15; read 2026-10-20).
```python
from google.colab import userdata
try:
    token = userdata.get("HF_TOKEN")      # never print it
except userdata.SecretNotFoundError:
    token = None                           # secret not defined (left sidebar, key icon)
except userdata.NotebookAccessError:
    token = None                           # user did not grant this notebook access
```
- Exceptions: `SecretNotFoundError`, `NotebookAccessError`, and `TimeoutException`. `TimeoutException` means the call was not run from the Colab UI. The secret name must not contain spaces.
- `huggingface_hub` already reads the Colab secret `HF_TOKEN` automatically through `google.colab.userdata`. If the secret is missing, it only warns. **confirmed**: https://raw.githubusercontent.com/huggingface/huggingface_hub/v1.33.0/src/huggingface_hub/utils/_auth.py (2026-10-20).
- **None of the recommended models in §4 are gated**, so no token is needed (Hub API `gated=False`, 2026-10-20). Avoid Gemma: it is gated (`gated=manual`) and also refuses fp16 in vLLM (§2).

### 1.7 GPU detection snippet (inference; not run)

Detect the GPU with `nvidia-smi` **before** importing torch or vllm. If CUDA is initialized first, vLLM switches its workers to `spawn` and prints a warning (§2).
```python
import subprocess
q = "name,memory.total,compute_cap"
out = subprocess.run(["nvidia-smi", f"--query-gpu={q}", "--format=csv,noheader,nounits"],
                     capture_output=True, text=True).stdout.strip()
name, mem_mib, cc = [s.strip() for s in out.split(",")]
major = int(cc.split(".")[0]); mem_gb = int(mem_mib) / 1024
NATIVE_BF16 = major >= 8
DTYPE = "bfloat16" if NATIVE_BF16 else "half"
```
Later, after importing torch, the same facts come from `torch.cuda.get_device_properties(0)`: `.name`, `.total_memory`, `.major` and `.minor`.

Suggested plans per GPU (**inference**; sizes from the Hub API in §4, nothing measured):

| GPU | dtype | Serving model (G1/G2/G4/G5) | vLLM settings | GRPO (G3) |
|---|---|---|---|---|
| T4 15 GB | `half` | Qwen2.5-Coder-1.5B-Instruct (3.1 GB weights) | `max_model_len=4096`, `gpu_memory_utilization=0.85`, `enforce_eager=True` | Qwen2.5-0.5B-Instruct or Qwen2.5-Coder-0.5B-Instruct + LoRA; `num_generations=8`, `max_completion_length=256`, `per_device_train_batch_size=8`, `use_vllm=False`, `bf16=False` |
| L4 22.5 GB | `bfloat16` | 1.5B by default; 7B (15.2 GB weights) only with `max_model_len<=4096` (tight) | `gpu_memory_utilization=0.90` | 1.5B + LoRA, `bf16=True`, `use_vllm=False` |
| A100 40 GB | `bfloat16` | Qwen2.5-Coder-7B-Instruct | `max_model_len=8192` | 1.5B + LoRA; optional `use_vllm=True`, `vllm_mode="colocate"`, `vllm_gpu_memory_utilization=0.3` |
| A100 80 GB, H100, G4 | `bfloat16` | 7B | defaults | 1.5B–3B + LoRA, optional vLLM colocate |

---

## 2. vLLM

- **Latest stable: 0.32.0**, released 2026-10-18 (GitHub release `v0.32.0`, PyPI). Previous releases: 0.31.0 (2026-10-05) and 0.30.0 (2026-09-22). **confirmed**: https://pypi.org/pypi/vllm/json, https://github.com/vllm-project/vllm/releases (2026-10-20).
- 0.32.0 breaking changes: Python 3.10 dropped (it supports 3.11–3.14), `transformers>=5.16.1,<5.20.0`, cascade attention removed, and `max_tokens` is now an upper bound rather than reserved. **confirmed** from the v0.32.0 release notes.
- **GPU support:** the docs say "compute capability 7.5 or higher (e.g., T4, RTX20xx, A100, L4, H100, B200, etc.)". So **T4, L4, A100, H100 and G4 are all supported**. **confirmed**: https://raw.githubusercontent.com/vllm-project/vllm/v0.32.0/docs/getting_started/installation/gpu.cuda.inc.md (2026-10-20).
- **Attention backend on T4:** FlashAttention requires compute capability 8.0 or higher (`flash_attn.py`). FlashInfer is deliberately disabled on SM75 because of a Turing bug (flashinfer issue 3620). `TRITON_ATTN` accepts any capability. So a T4 gets TRITON_ATTN (or FLEX_ATTENTION). **confirmed**: https://raw.githubusercontent.com/vllm-project/vllm/v0.32.0/vllm/v1/attention/backends/flashinfer.py, https://raw.githubusercontent.com/vllm-project/vllm/v0.32.0/vllm/v1/attention/backends/flash_attn.py, https://raw.githubusercontent.com/vllm-project/vllm/v0.32.0/vllm/v1/attention/backends/triton_attn.py (2026-10-20). Expect slower throughput than on Ampere and newer (inference).
- **dtype on T4:** with `dtype="auto"` and a bf16 checkpoint (all Qwen models here), v0.32.0 logs a warning and **falls back to float16**. Explicit `dtype="bfloat16"` raises `ValueError: Bfloat16 is only supported on GPUs with compute capability of at least 8.0 ... --dtype=half`. The model types gemma2, gemma3, gemma3_text and glm4 **refuse float16**. **confirmed**: `_resolve_auto_dtype` in https://raw.githubusercontent.com/vllm-project/vllm/v0.32.0/vllm/config/model.py and `check_if_supports_dtype` in `vllm/platforms/cuda.py` (2026-10-20). Notebooks should still pass `dtype` explicitly (`"half"` on T4).
- **Wheels / CUDA:** the release notes say `pip install vllm` gives the **CUDA 13.0** build, and that `+cu129` wheels are attached to the GitHub release. The install doc still says the binaries are "compiled with CUDA 12.9 ... by default". **uncertain** (the doc text and release notes conflict). Colab's image already has CUDA 13 torch, so the default wheel should work (inference).
- Release assets for v0.32.0 include `vllm-0.32.0+cu129-cp38-abi3-manylinux_2_28_x86_64.whl` (GitHub API, 2026-10-20). **confirmed**.

### 2.1 Minimal offline batched API (confirmed field names, v0.32.0)

Sources: https://raw.githubusercontent.com/vllm-project/vllm/v0.32.0/docs/getting_started/quickstart.md and https://raw.githubusercontent.com/vllm-project/vllm/v0.32.0/vllm/sampling_params.py (2026-10-20).
```python
from vllm import LLM, SamplingParams
llm = LLM(model="Qwen/Qwen2.5-Coder-1.5B-Instruct",
          revision="2e1fd397ee46e1388853d2af2c993145b0f1098a",
          dtype=DTYPE, max_model_len=4096, gpu_memory_utilization=0.85, seed=0)
params = SamplingParams(n=50, temperature=0.8, top_p=1.0, top_k=0,
                        repetition_penalty=1.0, max_tokens=512, seed=1234)
conversations = [[{"role": "user", "content": p}] for p in prompts]
outputs = llm.chat(conversations, params)     # applies the chat template
samples = [[c.text for c in o.outputs] for o in outputs]   # len == n per prompt
```
- `SamplingParams` defaults (v0.32.0): `n=1`, `temperature=1.0`, `top_p=1.0`, `top_k=0` (0 or -1 means all tokens), `repetition_penalty=1.0`, `seed=None`, and **`max_tokens=16`**. Always set `max_tokens`, or completions get cut off at 16 tokens. **confirmed**.
- `llm.generate()` does **not** apply the chat template. `llm.chat()` does (quickstart). **confirmed**.
- **Model default sampling params:** when `sampling_params` is None, `LLM.generate/chat` use the model's `generation_config.json`. If you pass your own `SamplingParams`, its own dataclass defaults are used. The OpenAI-compatible **server**, by contrast, fills any field missing from a request from the model's `generation_config.json`. For Qwen2.5-Coder-1.5B-Instruct those defaults are `temperature 0.7, top_p 0.8, top_k 20, repetition_penalty 1.1` (0.5B: repetition_penalty 1.05). In a temperature sweep through the server, either send `top_p`, `top_k` and `repetition_penalty` explicitly or start the server with `--generation-config vllm`. **confirmed**: `vllm/entrypoints/llm.py` lines with `get_default_sampling_params`, https://raw.githubusercontent.com/vllm-project/vllm/v0.32.0/docs/usage/troubleshooting.md ("Generation quality changed"), and https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct/raw/main/generation_config.json (2026-10-20).
- Per-token log-probs of the *input* (useful for Min-K%, §6) come from `SamplingParams(prompt_logprobs=0, max_tokens=1)`. The field exists (**confirmed**). Plain transformers forward passes are simpler and deterministic for G4 (inference).

### 2.2 Server mode (for agent loops, G2)

```
vllm serve Qwen/Qwen2.5-Coder-1.5B-Instruct --dtype half --max-model-len 8192 --gpu-memory-utilization 0.85 --generation-config vllm --port 8000
```
- The default port is 8000. The API base is `http://localhost:{PORT}/v1`, with endpoints `/v1/models`, `/v1/completions` and `/v1/chat/completions`. `--api-key` is optional. **confirmed**: quickstart (2026-10-20).
- Tool calling for Qwen2.5: `--enable-auto-tool-choice --tool-call-parser hermes`. **confirmed**: https://raw.githubusercontent.com/vllm-project/vllm/v0.32.0/docs/features/tool_calling.md (2026-10-20).
- In Colab, start it with `subprocess.Popen([...], stdout=logfile, stderr=subprocess.STDOUT)` and poll `/v1/models` until it answers. A `!vllm serve` cell would block the notebook (inference).

### 2.3 Known Colab and notebook pitfalls

1. A torch replacement needs a session restart (§0). (inference)
2. **Multiprocessing:** if CUDA was initialized before vLLM starts, vLLM logs "CUDA was previously initialized. We must use the `spawn` multiprocessing start method". To debug, or if spawn fails in a notebook, set `os.environ["VLLM_ENABLE_V1_MULTIPROCESSING"] = "0"` before creating `LLM`. **confirmed** (docs): https://raw.githubusercontent.com/vllm-project/vllm/v0.32.0/docs/usage/troubleshooting.md, sections "Breakpoints" and "Python multiprocessing" (2026-10-20). Whether a Colab notebook actually needs it is **uncertain**.
3. **Memory:** by default vLLM pre-allocates `gpu_memory_utilization` (0.9) of VRAM. Qwen2.5-Coder's default context is 32768 tokens (`max_position_embeddings`, config.json, confirmed). On a T4, set `max_model_len` (for example 4096) and lower `gpu_memory_utilization` if anything else (a judge model, a trainer) shares the GPU. (inference)
4. `enforce_eager=True` skips CUDA-graph capture. That gives a faster start and less memory, at slower decoding. It is also the docs' first debugging step for CUDA errors. **confirmed** (docs, troubleshooting) for the debugging use; the memory benefit is inference.
5. **Freeing the GPU** between experiments in one session is unreliable, because `del llm` may not release memory. Restart the runtime between big phases, for example vLLM sampling and then GRPO training. (inference)
6. Do not run the vLLM server and a GRPO trainer at the same time on a T4. (inference)
7. **Qwen3.5 small models** (0.8B/2B/4B/9B) are hybrid Gated DeltaNet plus attention models with vision. Their Feb 2026 model card said vLLM from the main branch was needed. These are **not recommended on T4**: they are untested, the linear-attention Triton kernels may not support SM75, and the checkpoints are bf16. **confirmed** facts are from https://huggingface.co/Qwen/Qwen3.5-2B/raw/main/README.md (2026-10-20). The T4 risk is inference.

---

## 3. Hugging Face TRL (GRPO) and PEFT

- **TRL 1.16.0** (PyPI, 2026-10-15). It requires Python >=3.11 and transformers >=4.56.2. Its `[vllm]` extra pins `vllm>=0.22.0,<=0.31.0`, and its `[peft]` extra pins `peft>=0.13.0`. **confirmed**: https://pypi.org/pypi/trl/1.16.0/json (2026-10-20).
- TRL 1.0 (about 2026-03-31) made SFT, DPO, reward modeling, RLOO and GRPO a semver-stable API. **reported**: https://lilting.ch/en/articles/trl-v1-post-training-library (2026-10-20).
- TRL 1.13.0 removed `PPOTrainer`/`PPOConfig`. **confirmed**: https://github.com/huggingface/trl/releases (v1.13.0 notes, 2026-10-20).

### 3.1 GRPOConfig (v1.16.0 source; confirmed)

Source: https://raw.githubusercontent.com/huggingface/trl/v1.16.0/trl/trainer/grpo_config.py and `base_config.py` (2026-10-20).

| Field | Default | Note |
|---|---|---|
| `learning_rate` | 1e-6 | TrainingArguments default is 5e-5 |
| `num_generations` | 8 | group size G; must be >=2 |
| `max_completion_length` | 512 | |
| `generation_batch_size` / `steps_per_generation` | None | default `per_device_train_batch_size * num_processes * steps_per_generation`, with `steps_per_generation = gradient_accumulation_steps`. **It must be divisible by `num_generations`.** You cannot set both. |
| `temperature`, `top_p`, `top_k`, `min_p`, `repetition_penalty` | 1.0, 1.0, 0, None, 1.0 | generation settings |
| `beta` | 0.0 | KL coefficient; 0 means no reference model is loaded (saves memory) |
| `num_iterations` | 1 | μ |
| `epsilon` | 0.2 | clip |
| `loss_type` | `"dapo"` | other options: `grpo`, `dr_grpo`, `bnpo`, `cispo`, `sapo`, `luspo`, `vespo` |
| `scale_rewards` | `"group"` | `"batch"` or `"none"` (Dr. GRPO suggests none) |
| `mask_truncated_completions` | False | |
| `use_vllm` / `vllm_mode` | False / `"colocate"` | `vllm_gpu_memory_utilization=0.3`, `vllm_enable_sleep_mode=False` |
| `remove_unused_columns` | False | keeps extra dataset columns for the reward function |
| `log_completions` | False | |
| `gradient_checkpointing` | **True** | different from TrainingArguments |
| `logging_steps` | 10 | |
| `bf16` | **True if `fp16` is not set** | on a T4, set `bf16=False` explicitly (§1.1) |
| `model_init_kwargs` | None | dict passed to `from_pretrained`; use `{"dtype": ..., "revision": ...}` (transformers 5 deprecated `torch_dtype` for `dtype`, confirmed in `modeling_utils.py` v5.20.2) |

- `auto_find_batch_size=True` raises an error, because it would break the prompt groups. **confirmed**.
- `max_prompt_length` **is not a GRPOConfig field in 1.16.0**. Older tutorials that pass it will fail with an unexpected keyword. Keep prompts short. The field's absence is **confirmed** (grep of grpo_config, base_config and grpo_trainer); the TypeError is inference.

### 3.2 Reward function signature (confirmed)

Sources: `GRPOTrainer._calculate_rewards` in https://raw.githubusercontent.com/huggingface/trl/v1.16.0/trl/trainer/grpo_trainer.py and https://raw.githubusercontent.com/huggingface/trl/v1.16.0/docs/source/grpo_trainer.md, "Using a custom reward function" (2026-10-20).
```python
def reward_fn(prompts, completions, completion_ids, **kwargs) -> list[float | None]:
    # kwargs: every dataset column except "prompt" (e.g. tests=...), plus
    # trainer_state, log_extra(column, values), log_metric(name, value)
    ...
```
- Standard (text) dataset: `completions` is a list of strings. Conversational dataset: each completion is a list of message dicts, so read `completion[0]["content"]`.
- The function must return exactly one value per completion. `None` means "not applicable" and becomes NaN. `async def` reward functions are allowed.
- The dataset needs a `"prompt"` column. The tokenizer needs a pad token and left padding (the trainer sets these).
- GRPOTrainer signature: `GRPOTrainer(model, reward_funcs, args, train_dataset, eval_dataset, processing_class, reward_processing_classes, callbacks, optimizers, quantization_config, peft_config, tools, rollout_func, environment_factory)`. **confirmed**.
- A reward function that runs model-written code is running untrusted code. Use a subprocess with a timeout in a temp dir. OpenAI's human-eval warns that its `execution.py` "is NOT a security sandbox": https://raw.githubusercontent.com/openai/human-eval/master/human_eval/execution.py (2026-10-20). **confirmed**.

### 3.3 PEFT LoRA basics (peft 0.21.2; confirmed)

Sources: https://raw.githubusercontent.com/huggingface/peft/v0.21.2/src/peft/tuners/lora/config.py and `mapping_func.py` (2026-10-20).
```python
from peft import LoraConfig
peft_config = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.0,
                         target_modules="all-linear", task_type="CAUSAL_LM")
# pass to GRPOTrainer(..., peft_config=peft_config); the trainer wraps the model
```
- Defaults: `r=8`, `lora_alpha=8`, `lora_dropout=0.0`, `bias="none"`. `target_modules=None` uses per-architecture defaults. `"all-linear"` selects all linear layers.
- `get_peft_model(..., autocast_adapter_dtype=True)` is the default. It casts fp16/bf16 adapter weights to float32 for stable training.

### 3.4 Does GRPO + LoRA run on a T4?

- **Yes, per TRL's official notebook** "GRPO with LoRA/QLoRA using TRL — on a Free Colab Notebook" (T4): https://github.com/huggingface/trl/blob/v1.16.0/examples/grpo_qlora/grpo_qlora.ipynb (read 2026-10-20). **confirmed** as a claim by the TRL team. Not run by us. It reports:
  - Qwen2-7B-Instruct with QLoRA at about 9.2 GB VRAM on a T4, and LiquidAI/LFM2.5-1.2B-Instruct at about 1.12 GB.
  - Model loaded with `model_init_kwargs={"attn_implementation": "sdpa", "dtype": "float32"}` (the comment says to change to bfloat16 if the GPU supports it). `optim="paged_adamw_8bit"`, `per_device_train_batch_size=8`, `num_generations=8`, `max_completion_length=256`, `learning_rate=2e-5`, and **no vLLM**. The notebook says vLLM with QLoRA can cause weight precision issues.
  - 500 steps with the 7B model take "around 13 hours" on a T4.
  - It sets neither `bf16` nor `fp16`, so `bf16=True` (emulated) is in effect on a T4. Explicit `bf16=False` is safer (inference).
- **So a 0.5B–1.5B model with plain LoRA should fit on a T4** with room to spare (**inference**). Low-memory settings, all inference:
  - Use a 0.5B model. Set `num_generations=8` (or 4), `per_device_train_batch_size=8` (one prompt group per step) and `max_completion_length=128–256`.
  - Keep `gradient_checkpointing=True` (the default) and `beta=0.0` (no reference model). Set `use_vllm=False` on a T4.
  - Load the base model in float32 with `bf16=False, fp16=False` for stability, or `fp16=True` for speed. fp16 can overflow on some Qwen checkpoints, so watch for NaN loss.
  - Use `report_to="none"` and `save_strategy="no"`, and set `max_steps` explicitly (for example 100–300).
  - Expect minutes per 10 steps, not seconds.
- TRL's `reducing_memory_usage.md` covers truncation, padding-free mode, activation offloading, vLLM sleep mode and gradient checkpointing: https://raw.githubusercontent.com/huggingface/trl/v1.16.0/docs/source/reducing_memory_usage.md (2026-10-20). **confirmed**.
- `use_liger_kernel` is deprecated in GRPOTrainer in favor of `model_init_kwargs={"use_kernels": True}` (base_config docstring). **confirmed**. Kernels support on a T4 is **uncertain**, so leave it off on a T4.

---

## 4. Small open-weight models (all repo ids verified on the Hugging Face Hub API, 2026-10-20)

Source for every row: `https://huggingface.co/api/models/<id>` (exists, license tag, gated flag, sha, sizes) on 2026-10-20. Pin `revision=<sha>`.

| Repo id | Params | Weights download | License | Gated | Pinned sha (2026-10-20) | Use |
|---|---|---|---|---|---|---|
| `Qwen/Qwen2.5-Coder-0.5B-Instruct` | 0.49B | 0.99 GB | apache-2.0 | no | `ea3f2471cf1b1f0db85067f1ef93848e38e88c25` | GRPO policy on T4; fast G1 |
| `Qwen/Qwen2.5-Coder-1.5B-Instruct` | 1.54B | 3.09 GB | apache-2.0 | no | `2e1fd397ee46e1388853d2af2c993145b0f1098a` | **default** G1/G2/G4 model |
| `Qwen/Qwen2.5-Coder-3B-Instruct` | 3B | (not checked) | **qwen-research** (not Apache) | no | `488639f1ff80…` | avoid unless the license is OK |
| `Qwen/Qwen2.5-Coder-7B-Instruct` | 7.6B | 15.2 GB | apache-2.0 | no | `c03e6d358207e414f1eca0bb1891e29f1db0e242` | L4 (tight) / A100+ |
| `Qwen/Qwen2.5-0.5B-Instruct` | 0.49B | ~1 GB | apache-2.0 | no | `7ae557604adf67be50417f59c2c2f167def9a775` | GRPO; TRL's quick-start model |
| `Qwen/Qwen2.5-1.5B-Instruct` | 1.5B | ~3 GB | apache-2.0 | no | `989aa7980e4c…` | general instruct |
| `Qwen/Qwen3-1.7B` | 2.0B | 4.06 GB | apache-2.0 | no | `70d244cc86ccca08cf5af4e1e306ecf908b1ad5e` | thinking/non-thinking modes |
| `Qwen/Qwen3-4B-Instruct-2507` | 4.0B | 8.05 GB | apache-2.0 | no | `cdbee75f17c01a7cc42f958dc650907174af0554` | L4/A100 judge for G5 |
| `ricdomolm/mini-coder-1.7b` | 1.72B | 3.44 GB | mit | no | `5b7fbc90b6c4684c546de7f811865cff4414a96c` | **G2 agent model**: Qwen3-1.7B distilled on 400k mini-swe-agent trajectories |
| `ricdomolm/mini-coder-4b` | 4.0B | (not checked) | mit | no | `c87892d046a62415a349a6b3aa244bb630fb7417` | G2 on L4/A100 |
| `HuggingFaceTB/SmolLM2-1.7B-Instruct` | 1.7B | — | apache-2.0 | no | `31b70e2e869a…` | non-Qwen alternative |
| `microsoft/Phi-4-mini-instruct` | ~3.8B | — | mit | no | `cfbefacb9925…` | non-Qwen alternative |
| `deepseek-ai/deepseek-coder-1.3b-instruct` | 1.3B | — | deepseek (custom) | no | `e063262dac83…` | older; custom license |
| `google/gemma-3-1b-it` | 1B | — | gemma | **manual** | — | avoid (gated; fp16 refused by vLLM) |
| `Qwen/Qwen3.5-0.8B`, `Qwen/Qwen3.5-2B` | 0.87B, 2.27B | — | apache-2.0 | no | — | newest small Qwen (Feb 2026), multimodal hybrid; avoid on T4 (§2.3.7) |

- Newer Qwen coder models exist but are not small: `Qwen/Qwen3-Coder-30B-A3B-Instruct` (2025-07), `Qwen/Qwen3-Coder-Next` (2026-01-30). No Qwen3-Coder model under 7B was found (Hub search `author=Qwen&search=Coder`, 2026-10-20). **confirmed** for the search result.
- The mini-coder-1.7b model card self-reports SWE-bench Verified (bash only) pass@1 18.6 and pass@100 50.4: https://huggingface.co/ricdomolm/mini-coder-1.7b (2026-10-20). **reported** (author's own numbers). The table labels the model "mini-swe-1.7b".
- Qwen2.5-Coder technical report (arXiv 2409.12186, 2024-09-18) covers the 0.5B–32B family: https://arxiv.org/abs/2409.12186. **confirmed** (abstract).

### 4.1 Tiny model for CPU smoke tests (under 50 MB)

- `trl-internal-testing/tiny-Qwen2ForCausalLM-2.5`: 2.4M params, about 21 MB total (4.9 MB weights), sha `ce8d0bf270b28c8fab026ced69fe8aa14b0f0eda`. TRL's own test model, with a Qwen2 tokenizer and chat template (inference: it is used in TRL tests). **confirmed** size and existence (Hub API, 2026-10-20).
- `hf-internal-testing/tiny-random-LlamaForCausalLM`: 1.0M params, about 15 MB, sha `9fb191250dd5…`. **confirmed**.
- Their outputs are random garbage. Use them only to test plumbing: shapes, reward functions, the Min-K% math, and log-prob extraction.

---

## 5. mini-swe-agent

- **It exists.** `SWE-agent/mini-swe-agent`, MIT license, about 8.7k stars, last push 2026-10-19. Latest PyPI release **2.4.6** (2026-07-23), Python >=3.10. **confirmed**: https://github.com/SWE-agent/mini-swe-agent, https://pypi.org/pypi/mini-swe-agent/json (2026-10-20).
- It matters for Polaris: DeepSWE and the Gemini 4 Argon model card's self-computed DeepSWE scores both used mini-swe-agent. See the playbook research file, `research/research-2026-10-20.json`. **confirmed** there.
- Install: `pip install mini-swe-agent==2.4.6`, or `uvx mini-swe-agent`, or `pipx run mini-swe-agent`. The CLI is `mini`, with flags `-t/--task`, `-c/--config`, `-m/--model` and `-y/--yolo` (it runs in confirm mode by default). Extra tools are under `mini-extra`. **confirmed**: https://raw.githubusercontent.com/SWE-agent/mini-swe-agent/v2.4.6/docs/quickstart.md and `docs/usage/mini.md` (2026-10-20).
- Dependency note: it pulls in `litellm` and excludes 1.82.7 and 1.82.8. Those two litellm releases were a supply-chain compromise on 2026-03-24 with a credential-stealing payload. **reported**: https://futuresearch.ai/blog/litellm-pypi-supply-chain-attack/ and https://www.netspi.com/blog/executive-blog/ai-ml-pentesting/litellm-supply-chain-compromise/ (2026-10-20). The exclusion is **confirmed** in PyPI `requires_dist`.
- **Pointing it at local vLLM (confirmed docs, not run):** https://raw.githubusercontent.com/SWE-agent/mini-swe-agent/v2.4.6/docs/models/local_models.md (2026-10-20)
  ```yaml
  model:
    model_name: "hosted_vllm/Qwen/Qwen2.5-Coder-1.5B-Instruct"   # litellm provider prefix
    model_kwargs:
      api_base: "http://localhost:{PORT}/v1"   # replace {PORT} with 8000
    cost_tracking: "ignore_errors"             # or env MSWEA_COST_TRACKING=ignore_errors
  ```
  You can also give litellm a model registry with zero costs (`LITELLM_MODEL_REGISTRY_PATH`). Python API: `DefaultAgent(get_model(input_model_name=..., config={...}), LocalEnvironment(), **agent_config).run(task)`. **confirmed**: `docs/usage/python_bindings.md`, `src/minisweagent/models/__init__.py`, `agents/default.py` at v2.4.6.
- In v2 the default model class (`litellm`) uses **tool calls** (`config/mini.yaml`). A text-based variant uses fenced `mswea_bash_command` blocks (`config/mini_textbased.yaml`; model class name `litellm_textbased`). For small local models, use the text-based mode, or start vLLM with `--tool-call-parser hermes` for Qwen2.5. **confirmed** files; the advice is inference.
- `LocalEnvironment` runs commands directly on the Colab VM. Run it only inside a throwaway temp copy of the task (inference).
- **Recommendation (inference): for G2, write your own ~100-line loop.** Use the `openai` client (already in Colab, 2.54.0) against `vllm serve`, with one bash action per turn, `subprocess.run(..., timeout=)` in a temp dir, a step limit, and a JSONL transcript per attempt. Reasons:
  1. You control and log every turn, which the failure labels and first-wrong-turn analysis need.
  2. No litellm dependency.
  3. Small models handle a fixed text format more reliably than tool calls.
  4. It is about as long as a mini-swe-agent config.
  Offer mini-swe-agent with `ricdomolm/mini-coder-1.7b` as an optional comparison, since that model was trained on mini-swe-agent trajectories.

---

## 6. Methods

### 6.1 Min-K% Prob (Shi et al.)

- Paper: Weijia Shi, Anirudh Ajith, Mengzhou Xia, Yangsibo Huang et al., "Detecting Pretraining Data from Large Language Models", arXiv 2310.16789 (2023-10-25; ICLR 2024): https://arxiv.org/abs/2310.16789. Read via the arXiv API and https://arxiv.org/html/2310.16789v3 on 2026-10-20. **confirmed**.
- Idea: an unseen text tends to contain a few outlier tokens with very low probability under the model, and a seen text has fewer of them.
- Score: for tokens x_1..x_N, compute log p(x_i | x_<i). Take the set of the k% of tokens with the **lowest** log-probabilities and average those log-probs:
  `MinK(x) = (1/|S|) * sum_{i in S} log p(x_i | x_<i)`. A higher score (less negative) means "more likely seen". Threshold the score, or report **AUROC**. The paper also reports TPR at 5% FPR.
- **k = 20%**. It was chosen on a validation set and used for all experiments. **confirmed**.
- Benchmark WikiMIA: Wikipedia event pages created after 2023-01-01 are non-members, older ones are members. Lengths are 32/64/128/256 tokens, and there is a paraphrased setting. The dataset is `swj0419/WikiMIA` (MIT). **confirmed** (paper; HF API).
- Reference code (Apache-2.0) is https://github.com/swj0419/detect-pretrain-code `src/run.py`. It computes `k_length = int(len(all_prob)*ratio)`, sorts, takes the lowest, and stores `-np.mean(...)`, so **its sign is flipped**: there, lower means member. **confirmed** (2026-10-20). Pitfall: for short texts `int(N*0.2)` can be 0 and gives the mean of an empty list. Use `max(1, ...)` (inference).
- Follow-up: Min-K%++ (Zhang et al., arXiv 2404.02936, 2024-04-03) reports +6.2 to 10.5 AUROC points on WikiMIA: https://arxiv.org/abs/2404.02936. **confirmed** (abstract). Its abstract frames training samples as local maxima of the model's distribution. The exact per-token formula, which normalizes each token's log-prob by the mean and std of log-probs under the next-token distribution, comes from memory and was **not re-read**. Check the paper before you implement it.
- **Critical caveat for G4:** Duan et al., "Do Membership Inference Attacks Work on Large Language Models?" (arXiv 2402.07841, 2024-02-12) found that MIAs "barely outperform random guessing" on the Pile-trained Pythia models. They attribute apparent successes to **distribution shift**, for example members and non-members drawn from different time ranges, which is how WikiMIA is built: https://arxiv.org/abs/2402.07841. **confirmed** (abstract). Design consequence (inference): if you compare HumanEval text with freshly written problems, the score difference can come from style or date shift, not memorization. Control for it by writing fresh problems in exactly HumanEval's format, and add a paraphrased-HumanEval arm. Report the result as "evidence consistent with exposure", never as proof.

### 6.2 Cohen's kappa

- κ = (p_o − p_e) / (1 − p_e). Here p_o is the observed agreement rate and p_e is the agreement expected by chance from each rater's own label frequencies: p_e = Σ_l p1(l)·p2(l). **confirmed**: the scikit-learn `cohen_kappa_score` docstring, https://github.com/scikit-learn/scikit-learn/blob/main/sklearn/metrics/_classification.py (2026-10-20). Original: J. Cohen (1960), "A coefficient of agreement for nominal scales", *Educational and Psychological Measurement* 20(1):37–46.
- Worked example (computed here): 100 transcripts with labels A/B. The human gives 30 A and 70 B, the judge gives 25 A and 75 B, and they agree on 85. Then p_o = 0.85, p_e = 0.3·0.25 + 0.7·0.75 = 0.60, and κ = 0.625.
- Pitfalls:
  - κ is undefined when p_e = 1 (both raters always use one label). sklearn then returns NaN by default (`replace_undefined_by=np.nan`), which is **confirmed**.
  - κ can be low despite high agreement when one class is rare (the "kappa paradox"; Feinstein & Cicchetti 1990, inference/known).
  - The Landis & Koch (1977) bands (0.61–0.80 "substantial") are a convention, not a test. Report p_o, κ, the confusion matrix and n, plus a bootstrap CI over transcripts.

### 6.3 pass@k, pass^k, intervals

- **pass@k unbiased estimator** (Chen et al. 2021, "Evaluating Large Language Models Trained on Code", arXiv 2107.03374): draw n ≥ k samples per problem, count c correct, and use pass@k = E_problems[1 − C(n−c, k) / C(n, k)]. **confirmed**: https://arxiv.org/abs/2107.03374 and the reference code https://raw.githubusercontent.com/openai/human-eval/master/human_eval/evaluation.py (MIT; 2026-10-20). Stable form:
  ```python
  import numpy as np
  def pass_at_k(n, c, k):
      if n - c < k: return 1.0
      return 1.0 - np.prod(1.0 - k / np.arange(n - c + 1, n + 1))
  ```
- **pass^k** (τ-bench, Yao et al., arXiv 2406.12045) is the probability that all k i.i.d. trials succeed. Unbiased estimate per task: C(c, k) / C(n, k), averaged over tasks. **confirmed**: https://arxiv.org/abs/2406.12045 and https://raw.githubusercontent.com/sierra-research/tau-bench/main/tau_bench/run.py (`comb(c, k) / comb(num_trials, k)`; 2026-10-20).
- Worked numbers (computed here with the code above), for one problem with n = 50:
  - c = 10: pass@1 = 0.20, pass@5 = 0.6894, pass@10 = 0.9175; pass^5 = 0.000119.
  - c = 49: pass^5 = 0.90, pass^10 = 0.80.
- Wilson 95% interval for x/n (z = 1.96): 10/50 → [0.112, 0.330]; 0/50 → [0, 0.071]; 50/50 → [0.929, 1]. Computed here; the formula is from E. B. Wilson (1927), *JASA* 22:209–212.
- **Sampling assumption (inference, important):** a Wilson interval on 50 samples of **one** problem describes that problem's per-sample success probability at that temperature. That holds only if the samples are i.i.d. (same prompt, same seed policy). Across problems, samples within a problem are correlated, so use a **cluster bootstrap over problems** or clustered standard errors: Miller, "Adding Error Bars to Evals" (arXiv 2411.00640, 2024-11-01), https://arxiv.org/abs/2411.00640. **confirmed** (abstract). With 20 problems, the across-problem uncertainty dominates. Say so.

---

## 7. Problem sets: public benchmarks vs our own 20 problems

Licenses (Hub API and GitHub API, 2026-10-20; **confirmed**):

| Set | Where | License | Pin |
|---|---|---|---|
| HumanEval (164 problems) | `openai/openai_humaneval` (HF); https://github.com/openai/human-eval | MIT | dataset sha `7dce6050a7d6d172f3cc5c32aa97f52fa1a2e544` |
| MBPP | `google-research-datasets/mbpp` (full and sanitized configs) | CC-BY-4.0 (attribution required) | sha `4bb6404fdc6cacfda99d4ac4205087b89d32030c` |
| HumanEval+ / MBPP+ (EvalPlus) | `evalplus/humanevalplus`, `evalplus/mbppplus` | Apache-2.0 | humanevalplus sha `d32357cf319e50e9c8d8dab5ea876c72b0fd321b` |
| LiveCodeBench lite | `livecodebench/code_generation_lite` | tag `license:cc` (variant unclear) | **uncertain** license |
| LBPP (Cohere, 161 problems, built to be uncontaminated) | `CohereForAI/lbpp` (from arXiv 2407.07565) | not checked | **uncertain** |

All of these may be loaded in a notebook at runtime (`datasets.load_dataset(..., revision=sha)`) with attribution. Do not paste large parts into the repo; loading at runtime avoids that (inference).

Contamination evidence (**confirmed**, abstracts read 2026-10-20):
- Riddell, Ni, Cohan, "Quantifying Contamination in Evaluating Code Generation Capabilities of Language Models" (arXiv 2403.04811) found substantial overlap between popular code benchmarks and open training corpora, and models score higher on the overlapping subsets: https://arxiv.org/abs/2403.04811.
- Matton, Sherborne, Aumiller et al., "On Leakage of Code Generation Evaluation Datasets" (arXiv 2407.07565) describe direct leakage, indirect leakage via synthetic data, and overfitting through model selection: https://arxiv.org/abs/2407.07565.
- EvalPlus (playbook research file) showed that HumanEval's few tests overestimate pass@k. Adding about 80x more tests cut pass@k by up to 19–29%.

**Recommendation (inference):** write **our own 20 problems** as the main set for G1, G2 (task variants) and G3.
- They should be HumanEval-style: a function signature plus a docstring, a hidden test file of 10 or more asserts with edge cases, and a reference solution. Date them 2026-10-20 and add a canary line.
- Why ours:
  1. These are after the training cutoffs of every model in §4, so no memorization.
  2. We control the hidden tests, which G3 (weak vs strong grader) needs.
  3. It is Polaris practice: hand-built tasks and graders are the job.
  4. No license or attribution friction.
  5. 20 problems × 50 samples = 1,000 generations, which takes minutes on a T4 with vLLM (inference).
- Use **public sets only where public is the point**. G4 needs a "probably seen" text set, and HumanEval (MIT) is the natural choice. A 20-problem HumanEval subset in G1 is also useful as a known-difficulty comparison. HumanEval has 164 problems (dataset card, **confirmed**). Small coder models probably score high on it, so expect a ceiling there and make our problems harder. Exact Qwen2.5-Coder HumanEval scores were not verified (inference).
- Caveat: 20 problems give wide across-problem intervals (§6.3). Say this in the notebook.

---

## 8. Open questions / not verified

1. Real Colab behavior of vLLM 0.31/0.32 on a T4 (TRITON_ATTN path, fp16 fallback, install time, disk use): not run, **uncertain**.
2. Whether `torch.cuda.is_bf16_supported()` returns True on a Colab T4: inference from source.
3. Official Colab prices and Pro vs Pro+ GPU entitlement (H100 especially): **uncertain**. The signup page could not be read.
4. vLLM default PyPI wheel CUDA version (13.0 per the release notes, 12.9 per the docs text): **uncertain**. It probably does not matter on Colab's CUDA-13 driver.
5. Whether GRPO with fp16 AMP on Qwen2.5-0.5B is numerically stable on a T4: **uncertain**. fp32 is the safe default.
6. Docker availability in Colab: not checked on a VM. Assume none.
7. mini-swe-agent's text-based mode against vLLM in Colab: docs-checked, not run.
