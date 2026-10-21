// ringlog: a fixed-size, in-memory log that keeps the newest records.
//
// A RingLog holds at most `capacity` records. When it is full, push()
// overwrites the oldest record. Each message keeps at most `max_text` bytes;
// longer messages are cut. Not thread-safe: use one RingLog per thread or
// add your own lock.
#ifndef RINGLOG_H
#define RINGLOG_H

#include <cstddef>
#include <cstdint>
#include <string>

namespace ringlog {

enum class Level : std::uint8_t { kDebug = 0, kInfo = 1, kWarn = 2, kError = 3 };

// "DEBUG", "INFO", "WARN" or "ERROR".
const char* level_name(Level level);

struct Record {
  std::uint64_t seq;  // 1 for the first stored record, then +1 per record
  Level level;
  std::string text;   // at most max_text bytes
};

class RingLog {
 public:
  // Throws std::invalid_argument if capacity or max_text is 0.
  RingLog(std::size_t capacity, std::size_t max_text);
  ~RingLog();
  RingLog(const RingLog&) = delete;
  RingLog& operator=(const RingLog&) = delete;

  // Stores a copy of the NUL-terminated `text`, cut to max_text bytes.
  void push(Level level, const char* text);

  std::size_t size() const { return size_; }
  std::size_t capacity() const { return capacity_; }
  std::uint64_t dropped() const { return dropped_; }  // records overwritten so far

  // at(0) is the oldest stored record, at(size() - 1) the newest.
  // Throws std::out_of_range if i >= size().
  Record at(std::size_t i) const;

  // One line per record, oldest first: "<seq> <LEVEL> <text>\n".
  std::string dump() const;

 private:
  struct Slot {
    std::uint64_t seq;
    Level level;
    std::size_t len;  // bytes of text, without the terminating NUL
    char* text;       // len bytes followed by a NUL, or nullptr if unused
  };

  // Logical index (0 = oldest) to physical slot index.
  std::size_t index_of(std::size_t i) const { return (start_ + i) % capacity_; }

  std::size_t capacity_;
  std::size_t max_text_;
  Slot* slots_;
  std::size_t start_ = 0;  // physical index of the oldest record
  std::size_t size_ = 0;
  std::uint64_t next_seq_ = 1;
  std::uint64_t dropped_ = 0;
};

}  // namespace ringlog

#endif  // RINGLOG_H
