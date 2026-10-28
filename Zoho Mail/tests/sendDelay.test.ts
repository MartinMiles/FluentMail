import { afterEach, describe, it, expect, vi } from "vitest";
import { SendDelay } from "../src/sendDelay";
afterEach(() => vi.useRealTimers());
describe("five-second Send grace period", () => {
  it("Send now submits the captured callback once and disarms the original timer", () => {
    vi.useFakeTimers();
    const delay = new SendDelay(),
      send = vi.fn(),
      tick = vi.fn();
    delay.start(send, tick);
    vi.advanceTimersByTime(2100);
    expect(delay.sendNow()).toBe(true);
    expect(delay.sendNow()).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(tick).toHaveBeenLastCalledWith(null);
    vi.advanceTimersByTime(10000);
    expect(send).toHaveBeenCalledTimes(1);
    delay.start(send, tick);
    delay.cancel();
    expect(delay.sendNow()).toBe(false);
    vi.advanceTimersByTime(10000);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("does not submit before five seconds and submits exactly once afterward", () => {
    vi.useFakeTimers();
    const delay = new SendDelay(),
      send = vi.fn(),
      tick = vi.fn();
    delay.start(send, tick);
    expect(tick).toHaveBeenCalledWith(5);
    vi.advanceTimersByTime(4999);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(delay.pending).toBe(false);
  });
  it("cancels at the last millisecond without sending and permits a fresh full delay", () => {
    vi.useFakeTimers();
    const delay = new SendDelay(),
      send = vi.fn();
    delay.start(send, () => {});
    vi.advanceTimersByTime(4999);
    delay.cancel();
    vi.advanceTimersByTime(10000);
    expect(send).not.toHaveBeenCalled();
    delay.start(send, () => {});
    vi.advanceTimersByTime(5000);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("invalidates an earlier timer when a new send is started", () => {
    vi.useFakeTimers();
    const delay = new SendDelay(),
      first = vi.fn(),
      second = vi.fn();
    delay.start(first, () => {});
    vi.advanceTimersByTime(1000);
    delay.start(second, () => {});
    vi.advanceTimersByTime(5000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
