#include "ringlog.h"

#include <cstdio>
#include <cstring>
#include <stdexcept>

namespace ringlog {

const char* level_name(Level level) {
  switch (level) {
    case Level::kDebug:
      return "DEBUG";
    case Level::kInfo:
      return "INFO";
    case Level::kWarn:
      return "WARN";
    case Level::kError:
      return "ERROR";
  }
  return "?";
}

RingLog::RingLog(std::size_t capacity, std::size_t max_text)
    : capacity_(capacity), max_text_(max_text), slots_(nullptr) {
  if (capacity == 0 || max_text == 0) {
    throw std::invalid_argument("ringlog: capacity and max_text must be at least 1");
  }
  slots_ = new Slot[capacity_];
  for (std::size_t k = 0; k < capacity_; ++k) {
    slots_[k] = Slot{0, Level::kInfo, 0, nullptr};
  }
}

RingLog::~RingLog() {
  for (std::size_t k = 0; k < capacity_; ++k) {
    delete[] slots_[k].text;
  }
  delete[] slots_;
}

void RingLog::push(Level level, const char* text) {
  std::size_t len = std::strlen(text);
  if (len > max_text_) {
    len = max_text_;
  }

  Slot* slot;
  if (size_ < capacity_) {
    slot = &slots_[index_of(size_)];
    ++size_;
  } else {
    slot = &slots_[start_];  // the oldest record is overwritten
    start_ = (start_ + 1) % capacity_;
    ++dropped_;
  }

  delete[] slot->text;
  slot->text = new char[len + 1];
  std::memcpy(slot->text, text, len);
  slot->text[len] = '\0';
  slot->len = len;
  slot->level = level;
  slot->seq = next_seq_++;
}

Record RingLog::at(std::size_t i) const {
  if (i >= size_) {
    throw std::out_of_range("ringlog: index out of range");
  }
  const Slot& s = slots_[index_of(i)];
  return Record{s.seq, s.level, std::string(s.text, s.len)};
}

std::string RingLog::dump() const {
  std::string out;
  char prefix[48];
  for (std::size_t i = 0; i < size_; ++i) {
    const Slot& s = slots_[index_of(i)];
    std::snprintf(prefix, sizeof prefix, "%llu %s ", static_cast<unsigned long long>(s.seq),
                  level_name(s.level));
    out += prefix;
    out.append(s.text, s.len);
    out += '\n';
  }
  return out;
}

}  // namespace ringlog
