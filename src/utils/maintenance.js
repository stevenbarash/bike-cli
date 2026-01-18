import { loadData, getComponents, addMaintenanceEvent, getMaintenanceEvents, getBikes } from "../services/db.js";

const COMPONENT_INTERVALS = {
  chain: { km: 3200, hours: 200 },
  tires: { km: 3200, hours: 200 },
  brake_pads: { km: 3200, hours: 200 },
  cassette: { km: 8000, hours: 400 },
  cables: { km: 16000, hours: 800 },
  bottom_bracket: { km: 16000, hours: 800 },
};

export const getMaintenanceStatus = async (bikeId) => {
  const data = await loadData();
  const bikes = getBikes(data);
  const bike = bikes.find((b) => b.id === bikeId);

  if (!bike) {
    return {
      components: [],
      events: [],
    };
  }

  const components = getComponents(data, bikeId);
  const events = getMaintenanceEvents(data, bikeId);

  const totalMileage = events.reduce((sum, e) => sum + (e.metersAt || 0), 0);

  const status = components.map((component) => {
    const interval = COMPONENT_INTERVALS[component.kind];
    const componentMileage = events
      .filter((e) => e.componentId === component.id)
      .reduce((max, e) => Math.max(max, e.metersAt || 0), 0);

    const componentTotal = totalMileage - componentMileage + component.installedMeters;
    const remaining = interval.km - componentTotal;

    let status = "good";
    if (remaining <= 0) {
      status = "overdue";
    } else if (remaining <= interval.km * 0.1) {
      status = "due";
    }

    return {
      id: component.id,
      name: component.name,
      kind: component.kind,
      installedMeters: component.installedMeters,
      currentMeters: componentTotal,
      interval: interval.km,
      remaining: Math.max(0, remaining),
      status,
    };
  });

  const sorted = status.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "overdue" ? -1 : b.status === "due" ? -1 : 1;
    }
    return a.remaining - b.remaining;
  });

  return {
    bike: {
      id: bike.id,
      name: bike.name,
      totalMileage: totalMileage,
    },
    components: sorted,
    recentEvents: events.slice(0, 5),
  };
};

export const logMaintenance = async (bikeId, kind, componentId, metersAt, notes) => {
  const data = await loadData();

  const eventId = crypto.randomUUID();
  const bike = getBikes(data).find((b) => b.id === bikeId);

  if (!bike) {
    throw new Error("Bike not found");
  }

  const event = {
    id: eventId,
    bikeId,
    componentId: componentId || null,
    kind,
    occurredAt: new Date().toISOString(),
    metersAt,
    notes: notes || null,
  };

  await addMaintenanceEvent(data, event);
};
