import { useMemo } from "react";
import { useDbStore } from "./mockStore.js";
import { countBy, groupBy, sumBy } from "../index.js";

export function useManagerStats() {
  const db = useDbStore();
  const apartments = db.apartments || [];
  const residents = db.residents || [];
  const vehicles = db.vehicles || [];
  const bills = db.bills || [];
  const absenceLogs = db.absence_logs || [];

  return useMemo(() => {
    // 1. Apartments
    const occupiedUnits = new Set(
      residents.filter((r) => r.status === "active").map((r) => r.apartment_id),
    ).size;

    // 2. Residents
    const heads = residents.filter((r) => r.is_head).length;

    // 3. Billing split using your custom selector function rule
    const { paid = [], unpaid = [] } = groupBy(bills, (b) => {
      if (b.status === "paid") return "paid";
      if (b.status === "due" || b.status === "overdue") return "unpaid";
      return "wait";
    });

    // 4. Recent Activity
    const recentActivity = [...paid]
      .sort((a, b) => new Date(b.paid_date) - new Date(a.paid_date))
      .slice(0, 5)
      .map(({ id, apartment_id, amount, paid_date }) => ({
        id,
        apt: apartment_id,
        amount,
        date: paid_date,
      }));

    // 5. Absences
    const currentMonth = new Date().getMonth();
    const monthlyAbsences = absenceLogs.filter(
      (log) => new Date(log.log_date).getMonth() === currentMonth,
    ).length;

    return {
      units: {
        total: apartments.length,
        occupied: occupiedUnits,
        vacant: apartments.length - occupiedUnits,
        types: countBy(apartments, "type"),
      },
      residents: {
        total: residents.length,
        status: countBy(residents, "status"),
        heads,
        dependents: residents.length - heads,
      },
      vehicles: {
        total: vehicles.length,
        types: countBy(vehicles, "type"),
      },
      billing: {
        revenue: sumBy(paid, (b) => b.amount),
        outstanding: sumBy(unpaid, (b) => b.amount),
        paid: paid.length,
        unpaid: unpaid.length,
        byFee: paid.reduce((acc, b) => {
          acc[b.fee_id] = (acc[b.fee_id] || 0) + b.amount;
          return acc;
        }, {}),
      },
      recentActivity,
      absences: {
        total: absenceLogs.length,
        byType: countBy(absenceLogs, "type"),
        monthly: monthlyAbsences,
      },
    };
  }, [apartments, residents, vehicles, bills, absenceLogs]);
}
