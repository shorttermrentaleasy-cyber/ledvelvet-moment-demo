export type DoorRole = "ordinary" | "loyalty" | "privileged" | "wally";

export type DeviceContext = {
  gate_id: string | null;
  door_role: DoorRole | null;
  device_label: string | null;
};

export function normalizeDoorRole(value: string | null | undefined): DoorRole | null {
  if (!value) return null;
  const v = value.toLowerCase().trim();
  if (v === "ordinary" || v === "loyalty" || v === "privileged" || v === "wally") {
    return v;
  }
  return null;
}

export function readDeviceContextFromSearchParams(searchParams: URLSearchParams): DeviceContext {
  const gate_id = searchParams.get("gate_id")?.trim() || null;
  const device_label = searchParams.get("device_label")?.trim() || null;
  const door_role = normalizeDoorRole(searchParams.get("door_role"));

  return { gate_id, door_role, device_label };
}