export interface ExampleUser {
  email: string;
  password: string;
  display_name: string;
  uk_city: string;
  answers: Record<string, string>;
}

// All example users share the demo domain so they can be bulk-deleted.
export const EXAMPLE_USER_DOMAIN = "@mithaq.demo";

// Answers key = question id from src/lib/survey-questions.ts.
export const EXAMPLE_USERS: ExampleUser[] = [
  {
    email: `aisha${EXAMPLE_USER_DOMAIN}`,
    password: "Example123!",
    display_name: "Aisha (example)",
    uk_city: "London",
    answers: {
      "1": "26", "2": "Female", "3": "London, UK", "4": "Depends on location",
      "5": "British Pakistani", "6": "Never married", "7": "No children",
      "8": "Master's or Doctorate", "9": "Software engineer",
      "10": "Hanafi", "11": "Moderately practicing", "12": "All five daily",
      "13": "Often", "14": "Yes", "15": "Very important", "16": "Yes, always",
      "17": "Strictly none", "18": "Weekly",
      "19": "6–12 months", "20": "Yes, required",
      "21": "Modest and mutually agreed", "22": "Open to it, depending on circumstances", "23": "No",
      "24": "Somewhat involved", "25": "No", "26": "None",
      "27": "English, Urdu", "28": "Moderate income", "29": "No debt",
      "30": "God-conscious, kind, ambitious",
    },
  },
  {
    email: `yusuf${EXAMPLE_USER_DOMAIN}`,
    password: "Example123!",
    display_name: "Yusuf (example)",
    uk_city: "Birmingham",
    answers: {
      "1": "29", "2": "Male", "3": "Birmingham, UK", "4": "Yes",
      "5": "British Bangladeshi", "6": "Never married", "7": "No children",
      "8": "Bachelor's degree", "9": "Civil engineer",
      "10": "Hanafi", "11": "Very practicing", "12": "All five daily",
      "13": "Always", "14": "Yes", "15": "Very important", "16": "Yes, always",
      "17": "Strictly none", "18": "Daily",
      "19": "Within 6 months", "20": "Yes, required",
      "21": "Whatever is reasonable and Sunnah", "22": "Yes", "23": "No",
      "24": "Very involved", "25": "No", "26": "None",
      "27": "English, Bengali, Arabic", "28": "Moderate income", "29": "Minor, manageable debt",
      "30": "Practising, family-oriented, gentle",
    },
  },
  {
    email: `maryam${EXAMPLE_USER_DOMAIN}`,
    password: "Example123!",
    display_name: "Maryam (example)",
    uk_city: "Manchester",
    answers: {
      "1": "24", "2": "Female", "3": "Manchester, UK", "4": "Yes",
      "5": "British Somali", "6": "Never married", "7": "No children",
      "8": "Bachelor's degree", "9": "Primary school teacher",
      "10": "Shafi'i", "11": "Moderately practicing", "12": "Most of them",
      "13": "Often", "14": "Yes", "15": "Very important", "16": "Yes, always",
      "17": "Strictly none", "18": "Weekly",
      "19": "1–2 years", "20": "Yes, required",
      "21": "Modest", "22": "Not sure", "23": "No",
      "24": "Somewhat involved", "25": "No", "26": "None",
      "27": "English, Somali", "28": "Entry-level income", "29": "No debt",
      "30": "Kind, respectful, deen-focused",
    },
  },
  {
    email: `ibrahim${EXAMPLE_USER_DOMAIN}`,
    password: "Example123!",
    display_name: "Ibrahim (example)",
    uk_city: "Leicester",
    answers: {
      "1": "31", "2": "Male", "3": "Leicester, UK", "4": "Depends on location",
      "5": "British Indian", "6": "Never married", "7": "No children",
      "8": "Master's or Doctorate", "9": "GP (family doctor)",
      "10": "Hanafi", "11": "Very practicing", "12": "All five daily",
      "13": "Always", "14": "Yes", "15": "Very important", "16": "Yes, always",
      "17": "Strictly none", "18": "Daily",
      "19": "6–12 months", "20": "Yes, required",
      "21": "Sunnah amount, agreed with wali", "22": "Open to it, depending on circumstances", "23": "No",
      "24": "Very involved", "25": "No", "26": "None",
      "27": "English, Gujarati, Urdu", "28": "High income", "29": "No debt",
      "30": "Practising, calm, family-minded",
    },
  },
  {
    email: `khadija${EXAMPLE_USER_DOMAIN}`,
    password: "Example123!",
    display_name: "Khadija (example)",
    uk_city: "Leeds",
    answers: {
      "1": "28", "2": "Female", "3": "Leeds, UK", "4": "Depends on location",
      "5": "British Arab", "6": "Divorced", "7": "1–2 children",
      "8": "Master's or Doctorate", "9": "Lawyer",
      "10": "Maliki or Hanbali", "11": "Moderately practicing", "12": "All five daily",
      "13": "Often", "14": "Yes", "15": "Very important", "16": "Yes, always",
      "17": "Strictly none", "18": "Weekly",
      "19": "1–2 years", "20": "Yes, preferred",
      "21": "Modest and meaningful", "22": "Yes", "23": "Yes",
      "24": "Minimal involvement", "25": "No", "26": "None",
      "27": "English, Arabic", "28": "High income", "29": "No debt",
      "30": "Mature, supportive, God-fearing",
    },
  },
  {
    email: `hamza${EXAMPLE_USER_DOMAIN}`,
    password: "Example123!",
    display_name: "Hamza (example)",
    uk_city: "Glasgow",
    answers: {
      "1": "27", "2": "Male", "3": "Glasgow, UK", "4": "Yes",
      "5": "British Pakistani", "6": "Never married", "7": "No children",
      "8": "Bachelor's degree", "9": "Product manager",
      "10": "Hanafi", "11": "Moderately practicing", "12": "Most of them",
      "13": "Often", "14": "Sometimes", "15": "Somewhat important", "16": "Yes, always",
      "17": "Strictly none", "18": "Weekly",
      "19": "6–12 months", "20": "Yes, preferred",
      "21": "Reasonable, agreed together", "22": "Yes", "23": "No",
      "24": "Somewhat involved", "25": "No", "26": "None",
      "27": "English, Urdu", "28": "Moderate income", "29": "No debt",
      "30": "Kind, practising, ambitious",
    },
  },
];
