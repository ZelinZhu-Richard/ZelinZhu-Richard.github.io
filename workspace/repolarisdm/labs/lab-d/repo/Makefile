# ringlog build. Targets:
#   make test    normal optimized build, then run the tests
#   make asan    AddressSanitizer + UndefinedBehaviorSanitizer build, then run the tests
#   make debug   -O0 -g build for lldb (does not run it)
#   make clean   remove build/
#
# macOS notes:
# - Apple clang has no LeakSanitizer, so leaks are not checked here.
# - The sanitizers call abort() by default on macOS, which writes a crash
#   report. abort_on_error=0 makes them exit with status 1 instead.
# - Live symbolization runs `atos -p`, which needs permission to inspect a
#   running process. So the report is printed with raw addresses and
#   symbolize.sh adds function and file:line offline (atos -o).

CXX = clang++
CXXFLAGS = -std=c++17 -Wall -Wextra -Wpedantic
SANFLAGS = -fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer -g -O1
SRCS = ringlog.cpp test_ringlog.cpp
HDRS = ringlog.h
BUILD = build

ifeq ($(shell uname -s),Darwin)
SYMBOLIZE = symbolize=0
else
SYMBOLIZE = symbolize=1
endif
SAN_ENV = ASAN_OPTIONS=abort_on_error=0:$(SYMBOLIZE) UBSAN_OPTIONS=abort_on_error=0:print_stacktrace=1:$(SYMBOLIZE)

.PHONY: test asan debug clean

$(BUILD)/test_ringlog: $(SRCS) $(HDRS)
	@mkdir -p $(BUILD)
	$(CXX) $(CXXFLAGS) -O2 -o $@ $(SRCS)

$(BUILD)/test_ringlog_asan: $(SRCS) $(HDRS)
	@mkdir -p $(BUILD)
	$(CXX) $(CXXFLAGS) $(SANFLAGS) -o $@ $(SRCS)

$(BUILD)/test_ringlog_debug: $(SRCS) $(HDRS)
	@mkdir -p $(BUILD)
	$(CXX) $(CXXFLAGS) -O0 -g -o $@ $(SRCS)

test: $(BUILD)/test_ringlog
	./$(BUILD)/test_ringlog

asan: $(BUILD)/test_ringlog_asan
	@$(SAN_ENV) ./$(BUILD)/test_ringlog_asan > $(BUILD)/asan.log 2>&1; status=$$?; \
	bash symbolize.sh $(BUILD)/test_ringlog_asan < $(BUILD)/asan.log; exit $$status

debug: $(BUILD)/test_ringlog_debug
	@echo "built $(BUILD)/test_ringlog_debug; start it with: lldb $(BUILD)/test_ringlog_debug"

clean:
	rm -rf $(BUILD)
