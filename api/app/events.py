"""Per-check in-memory event bus. SSE replays history then tails until `done`."""
import asyncio
from collections import OrderedDict
from typing import Any


class CheckBus:
    def __init__(self, check_id: str):
        self.check_id = check_id
        self.events: list[tuple[str, dict]] = []
        self.cond = asyncio.Condition()
        self.closed = False

    async def emit(self, event: str, data: dict[str, Any]) -> None:
        async with self.cond:
            if self.closed:
                return
            self.events.append((event, data))
            if event == "done":
                self.closed = True
            self.cond.notify_all()

    async def tail(self):
        i = 0
        while True:
            async with self.cond:
                while i >= len(self.events) and not self.closed:
                    try:
                        await asyncio.wait_for(self.cond.wait(), timeout=15)
                    except asyncio.TimeoutError:
                        break
                batch = self.events[i:]
                i = len(self.events)
                closed = self.closed
            if not batch and not closed:
                yield ("ping", {})
                continue
            for ev in batch:
                yield ev
            if closed and i >= len(self.events):
                return


class BusRegistry:
    def __init__(self, max_items: int = 200):
        self._buses: OrderedDict[str, CheckBus] = OrderedDict()
        self.max_items = max_items

    def create(self, check_id: str) -> CheckBus:
        bus = CheckBus(check_id)
        self._buses[check_id] = bus
        while len(self._buses) > self.max_items:
            oldest_id, oldest = next(iter(self._buses.items()))
            if not oldest.closed:
                break
            self._buses.pop(oldest_id)
        return bus

    def get(self, check_id: str) -> CheckBus | None:
        return self._buses.get(check_id)


buses = BusRegistry()
