export const MEETING_PACKAGES = {
  single: {
    id: "single",
    meetings: 1,
    amountPence: 5_000,
    label: "1 meeting",
    description: "A single imam-supported family meeting",
  },
  three: {
    id: "three",
    meetings: 3,
    amountPence: 12_000,
    label: "3 meetings",
    description: "Three meetings with ongoing imam support",
  },
  five: {
    id: "five",
    meetings: 5,
    amountPence: 17_500,
    label: "5 meetings",
    description: "Five meetings for a more supported journey",
  },
} as const;

export type MeetingPackageId = keyof typeof MEETING_PACKAGES;

export const MEETING_PACKAGE_IDS = Object.keys(MEETING_PACKAGES) as MeetingPackageId[];

export function isMeetingPackageId(value: string): value is MeetingPackageId {
  return value in MEETING_PACKAGES;
}

export function formatPence(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amountPence / 100);
}
