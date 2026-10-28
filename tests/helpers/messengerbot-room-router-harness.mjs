import assert from "node:assert/strict";

// Capture the domain boundary without simulating Android notification parsing.
// The real router has separate tests for exact thread IDs and fail-closed routing.
export function createRoomRouterHarness() {
  const registrations = [];
  const notifications = [];
  const stops = [];
  return {
    registrations,
    notifications,
    stops,
    require(name) {
      assert.equal(name, "KAKAO_ROOM_ROUTER");
      return {
        create(role, handler) {
          assert.ok(["KLOL_MAIN", "KLOL_NOTICE", "NEXUS_MAIN", "NEXUS_NOTICE"].includes(role));
          assert.equal(typeof handler, "function");
          registrations.push({ role, handler });
          const route = (sbn) => { notifications.push({ role, sbn }); };
          route.stop = () => { stops.push(role); };
          return route;
        },
      };
    },
    handler(role) {
      assert.equal(registrations.length, 1, "each profile must register exactly one domain handler");
      assert.equal(registrations[0].role, role);
      return registrations[0].handler;
    },
  };
}
