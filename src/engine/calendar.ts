import {
  DAYS_PER_MONTH,
  DAYS_PER_QUARTER,
  DAYS_PER_WEEK,
  DAYS_PER_YEAR,
  MONTHS_PER_QUARTER,
  QUARTERS_PER_YEAR,
  WEEKS_PER_MONTH,
} from "./balance";
import type {
  RtCampaignCalendar,
  RtHorizonKind,
} from "./types";

export function createCampaignCalendar(campaignDay = 1): RtCampaignCalendar {
  const day = Math.max(1, Math.min(DAYS_PER_YEAR, Math.floor(campaignDay)));
  const zeroBasedDay = day - 1;
  const week = Math.floor(zeroBasedDay / DAYS_PER_WEEK) + 1;
  const dayInWeek = (zeroBasedDay % DAYS_PER_WEEK) + 1;
  const month = Math.floor(zeroBasedDay / DAYS_PER_MONTH) + 1;
  const weekInMonth = Math.floor((zeroBasedDay % DAYS_PER_MONTH) / DAYS_PER_WEEK) + 1;
  const quarter = Math.floor(zeroBasedDay / DAYS_PER_QUARTER) + 1;
  const dayInQuarter = (zeroBasedDay % DAYS_PER_QUARTER) + 1;
  const monthInQuarter = Math.floor((zeroBasedDay % DAYS_PER_QUARTER) / DAYS_PER_MONTH) + 1;

  return {
    campaignDay: day,
    year: 1,
    week,
    dayInWeek,
    month,
    weekInMonth,
    quarter,
    dayInQuarter,
    monthInQuarter,
    daysPerWeek: DAYS_PER_WEEK,
    weeksPerMonth: WEEKS_PER_MONTH,
    daysPerMonth: DAYS_PER_MONTH,
    monthsPerQuarter: MONTHS_PER_QUARTER,
    daysPerQuarter: DAYS_PER_QUARTER,
    quartersPerYear: QUARTERS_PER_YEAR,
    daysPerYear: DAYS_PER_YEAR,
    unlockedHorizons: unlockedHorizonsForDay(day),
  };
}

export function isHorizonStart(calendar: RtCampaignCalendar, kind: RtHorizonKind): boolean {
  if (calendar.campaignDay <= 1) return false;
  if (kind === "week") return calendar.dayInWeek === 1;
  if (kind === "month") return calendar.dayInWeek === 1 && calendar.weekInMonth === 1;
  if (kind === "quarter") return calendar.dayInQuarter === 1;
  return false;
}

export function isHorizonEndDay(calendar: RtCampaignCalendar, kind: RtHorizonKind): boolean {
  if (kind === "week") return calendar.dayInWeek === calendar.daysPerWeek;
  if (kind === "month") return calendar.dayInWeek === calendar.daysPerWeek && calendar.weekInMonth === calendar.weeksPerMonth;
  if (kind === "quarter") return calendar.dayInQuarter === calendar.daysPerQuarter;
  return calendar.campaignDay === calendar.daysPerYear;
}

export function daysLeftInHorizon(calendar: RtCampaignCalendar, kind: RtHorizonKind): number {
  if (kind === "week") return calendar.daysPerWeek - calendar.dayInWeek;
  if (kind === "month") {
    const dayInMonth = ((calendar.weekInMonth - 1) * calendar.daysPerWeek) + calendar.dayInWeek;
    return calendar.daysPerMonth - dayInMonth;
  }
  if (kind === "quarter") return calendar.daysPerQuarter - calendar.dayInQuarter;
  return calendar.daysPerYear - calendar.campaignDay;
}

function unlockedHorizonsForDay(campaignDay: number): RtHorizonKind[] {
  const horizons: RtHorizonKind[] = ["week"];
  if (campaignDay > DAYS_PER_WEEK) horizons.push("month");
  if (campaignDay > DAYS_PER_MONTH) horizons.push("quarter");
  if (campaignDay > DAYS_PER_QUARTER) horizons.push("year");
  return horizons;
}
