export interface ExampleImam {
  name: string;
  title: string;
  mosque: string;
  city: string;
  postcode?: string;
  phone?: string;
  email?: string;
  website?: string;
  languages: string[];
  notes?: string;
}

// Fictional example imams — safe demo data.
export const EXAMPLE_IMAMS: ExampleImam[] = [
  {
    name: "Sheikh Yusuf Rahman",
    title: "Imam",
    mosque: "East London Central Masjid",
    city: "London",
    postcode: "E1 1JQ",
    phone: "+44 20 7000 1001",
    email: "imam.rahman@example.com",
    languages: ["English", "Arabic", "Urdu"],
    notes: "Available for nikah ceremonies and pre-marital counselling.",
  },
  {
    name: "Imam Abdullah Khan",
    title: "Imam",
    mosque: "Birmingham Central Mosque",
    city: "Birmingham",
    postcode: "B12 0XS",
    phone: "+44 121 000 1002",
    email: "imam.khan@example.com",
    languages: ["English", "Urdu", "Punjabi"],
  },
  {
    name: "Sheikh Ibrahim Malik",
    title: "Sheikh",
    mosque: "Manchester Islamic Centre",
    city: "Manchester",
    postcode: "M14 5AF",
    phone: "+44 161 000 1003",
    email: "sheikh.malik@example.com",
    languages: ["English", "Arabic", "Bengali"],
    notes: "Fluent in classical Arabic; long-standing marriage officiant.",
  },
  {
    name: "Imam Musa Adeyemi",
    title: "Imam",
    mosque: "Leeds Grand Mosque",
    city: "Leeds",
    postcode: "LS6 1AN",
    phone: "+44 113 000 1004",
    languages: ["English", "Yoruba", "Arabic"],
  },
  {
    name: "Sheikh Hamza Patel",
    title: "Sheikh",
    mosque: "Bradford Jamia Mosque",
    city: "Bradford",
    postcode: "BD8 8AF",
    phone: "+44 1274 000 1005",
    email: "sheikh.patel@example.com",
    languages: ["English", "Gujarati", "Urdu"],
  },
  {
    name: "Imam Omar Farah",
    title: "Imam",
    mosque: "Leicester Central Mosque",
    city: "Leicester",
    postcode: "LE1 5JN",
    phone: "+44 116 000 1006",
    languages: ["English", "Somali", "Arabic"],
  },
  {
    name: "Sheikh Bilal Ahmed",
    title: "Sheikh",
    mosque: "Glasgow Central Mosque",
    city: "Glasgow",
    postcode: "G5 0TH",
    phone: "+44 141 000 1007",
    email: "sheikh.ahmed@example.com",
    languages: ["English", "Urdu"],
  },
  {
    name: "Imam Zayd Hussain",
    title: "Imam",
    mosque: "Luton Central Mosque",
    city: "Luton",
    postcode: "LU1 3JH",
    phone: "+44 1582 000 1008",
    languages: ["English", "Urdu", "Pashto"],
    notes: "Offers weekend marriage-preparation classes for couples.",
  },
];
