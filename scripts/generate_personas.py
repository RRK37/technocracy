#!/usr/bin/env python3
"""Generate UK-demographically-representative personas for characters 200-299."""

import json
import os
import random
import time

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

# --- Configuration ---
CHAR_JSON = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "characters", "data", "all-characters.json")
SEED = 7
START_ID = 200
END_ID = 299
MODEL = "gpt-4o-mini"
MAX_RETRIES = 3

# --- UK Name Pools ---
# First names grouped by age bracket and gender, reflecting generational naming trends.
# Sources: ONS baby name statistics (England & Wales), historical popularity records.

FIRST_NAMES = {
    "male": {
        "18-24": [
            "Oliver", "Harry", "Jack", "George", "Noah", "Leo", "Oscar",
            "Charlie", "Jacob", "Thomas", "Alfie", "James", "Ethan", "Archie",
            "Joshua", "Max", "Henry", "Lucas", "Daniel", "Mason", "Logan",
            "Harrison", "Theo", "Sebastian", "Tyler", "Callum", "Jayden",
            "Liam", "Finley", "Aiden", "Kai", "Riley", "Nathan", "Reuben",
            "Zach", "Connor", "Dylan", "Ryan", "Adam", "Toby",
        ],
        "25-34": [
            "James", "David", "Daniel", "Michael", "Thomas", "Matthew",
            "Christopher", "Jack", "Andrew", "Joshua", "Ryan", "Benjamin",
            "Samuel", "Joseph", "Luke", "Alex", "Lewis", "Aaron", "Robert",
            "Jamie", "Adam", "Nathan", "Scott", "Mark", "Craig", "Darren",
            "Liam", "Callum", "Ross", "Stuart", "Kieran", "Peter", "Tom",
            "Jake", "Marcus", "Bradley", "Gavin", "Jordan", "Dominic", "Neil",
        ],
        "35-49": [
            "David", "Paul", "Andrew", "Mark", "James", "Richard", "Michael",
            "Simon", "Stephen", "Ian", "Robert", "Jason", "Gary", "Stuart",
            "Darren", "Kevin", "Martin", "Craig", "Lee", "Adrian", "Neil",
            "Jonathan", "Peter", "Anthony", "Wayne", "Philip", "Sean",
            "Nicholas", "Timothy", "Barry", "Keith", "Clive", "Graham",
            "Damien", "Carl", "Glen", "Trevor", "Shaun", "Dean", "Russell",
        ],
        "50-64": [
            "John", "David", "Michael", "Peter", "Paul", "Stephen", "Robert",
            "Brian", "Alan", "Philip", "Anthony", "Colin", "Keith", "Graham",
            "Martin", "Malcolm", "Derek", "Roger", "Kenneth", "Barry",
            "Terence", "Raymond", "Patrick", "Norman", "Nigel", "Gordon",
            "Trevor", "Geoff", "Dennis", "Gerald", "Clive", "Gareth",
            "Howard", "Russell", "Frank", "Douglas", "Roy", "Ian", "Eric", "Don",
        ],
        "65+": [
            "John", "Robert", "William", "George", "Arthur", "Edward",
            "Albert", "Ernest", "Frederick", "Harold", "Herbert", "Walter",
            "Alfred", "Stanley", "Leonard", "Frank", "Norman", "Ronald",
            "Donald", "Douglas", "Reginald", "Gerald", "Bernard", "Clifford",
            "Cecil", "Percy", "Cyril", "Sidney", "Victor", "Leslie",
            "Gordon", "Roy", "Derek", "Dennis", "Ralph", "Wilfred",
            "Kenneth", "Raymond", "Brian", "Colin",
        ],
    },
    "female": {
        "18-24": [
            "Olivia", "Amelia", "Isla", "Emily", "Ava", "Lily", "Mia",
            "Sophie", "Ella", "Grace", "Chloe", "Jessica", "Ruby", "Lucy",
            "Evie", "Freya", "Daisy", "Poppy", "Scarlett", "Isabella",
            "Millie", "Sienna", "Phoebe", "Harper", "Willow", "Georgia",
            "Megan", "Amber", "Bethany", "Ellie", "Zara", "Molly", "Hannah",
            "Jasmine", "Holly", "Leah", "Katie", "Eva", "Maya", "Rosie",
        ],
        "25-34": [
            "Jessica", "Charlotte", "Emma", "Rebecca", "Laura", "Amy",
            "Sarah", "Hannah", "Sophie", "Lauren", "Katie", "Lucy", "Emily",
            "Rachel", "Samantha", "Natalie", "Victoria", "Gemma", "Claire",
            "Holly", "Jade", "Nicola", "Kerry", "Stephanie", "Helen",
            "Alexandra", "Danielle", "Fiona", "Zoe", "Abigail", "Megan",
            "Louise", "Hayley", "Joanne", "Kirsty", "Leanne", "Carly",
            "Donna", "Michelle", "Anna",
        ],
        "35-49": [
            "Sarah", "Claire", "Nicola", "Karen", "Lisa", "Joanne", "Helen",
            "Michelle", "Amanda", "Tracey", "Sharon", "Julie", "Donna",
            "Rachel", "Deborah", "Louise", "Andrea", "Emma", "Caroline",
            "Paula", "Alison", "Susan", "Wendy", "Catherine", "Diane",
            "Maria", "Dawn", "Jacqueline", "Lesley", "Jane", "Christine",
            "Natalie", "Lorraine", "Beverley", "Tina", "Angela", "Denise",
            "Gillian", "Teresa", "Elaine",
        ],
        "50-64": [
            "Susan", "Margaret", "Janet", "Patricia", "Christine", "Carol",
            "Linda", "Barbara", "Sandra", "Jacqueline", "Diane", "Elaine",
            "Brenda", "Pamela", "Sheila", "Wendy", "Valerie", "Maureen",
            "Jean", "Ann", "Kathleen", "Doreen", "Rosemary", "Pauline",
            "Heather", "Judith", "Yvonne", "Lynne", "Hilary", "Gail",
            "Denise", "Beverley", "Lorraine", "Gillian", "Janice", "Irene",
            "Joyce", "Mary", "Elizabeth", "Dorothy",
        ],
        "65+": [
            "Margaret", "Mary", "Dorothy", "Joan", "Jean", "Betty",
            "Barbara", "Doris", "Edith", "Gladys", "Irene", "Hilda",
            "Elsie", "Phyllis", "Mabel", "Florence", "Ethel", "Winifred",
            "Marjorie", "Olive", "Vera", "Lillian", "Ivy", "Nellie",
            "Annie", "Rose", "Agnes", "Jessie", "Ada", "Alice",
            "Mavis", "Audrey", "Muriel", "Evelyn", "Beryl", "Enid",
            "Sylvia", "Eileen", "Joyce", "Constance",
        ],
    },
}

# UK surnames: mixture of English, Welsh, Scottish, Irish, South Asian, Caribbean,
# East Asian, and other backgrounds reflecting modern UK demographics.
# Approx breakdown: 70% British Isles origin, 15% South Asian, 8% other European/global, 7% other.
SURNAMES = [
    # English - common
    "Smith", "Jones", "Taylor", "Brown", "Wilson", "Evans", "Walker", "Roberts",
    "Turner", "Phillips", "Campbell", "Parker", "Edwards", "Collins", "Stewart",
    "Morris", "Murphy", "Cook", "Morgan", "Bell", "Young", "King", "Wright",
    "Clarke", "Green", "Hall", "Wood", "Harris", "Lewis", "Robinson", "Baker",
    "Hill", "Adams", "Mitchell", "Carter", "Fox", "Marshall", "Gray", "Hunt",
    "Palmer", "Barnes", "Mason", "Porter", "Bennett", "Cox", "Reed", "Ellis",
    "Webb", "Owen", "Price",
    # English - less common / distinctive
    "Hargreaves", "Whitfield", "Ashworth", "Butterworth", "Blackwood", "Chambers",
    "Cresswell", "Fairclough", "Hartley", "Kershaw", "Marsden", "Ogden",
    "Pearson", "Sutcliffe", "Thornton", "Wainwright", "Eastwood", "Goodwin",
    "Holloway", "Langley", "Redmond", "Shelley", "Whitaker", "Bradshaw",
    "Crowley", "Faulkner", "Graves", "Irving", "Lockwood", "Norris",
    # Welsh
    "Griffiths", "Rees", "Davies", "Llewellyn", "Bowen", "Pritchard", "Vaughan",
    "Rhys", "Bevan", "Floyd",
    # Scottish
    "MacDonald", "Fraser", "Murray", "Ross", "Cameron", "Hamilton", "Sinclair",
    "Douglas", "Mackenzie", "Henderson",
    # Irish
    "O'Brien", "O'Connor", "Brennan", "Gallagher", "Doyle", "Quinn", "Byrne",
    "Fitzgerald", "Nolan", "Kelly",
    # South Asian
    "Patel", "Shah", "Khan", "Ahmed", "Hussain", "Ali", "Begum", "Singh",
    "Kaur", "Sharma", "Gupta", "Chowdhury", "Rahman", "Nawaz", "Malik",
    "Kumar", "Desai", "Nair", "Bhat", "Rao", "Joshi", "Siddiqui", "Mirza",
    "Chandra", "Kapoor",
    # East / Southeast Asian
    "Chen", "Wong", "Li", "Nguyen", "Kim", "Tanaka", "Suzuki", "Lau",
    "Cheung", "Leung",
    # African / Caribbean
    "Okafor", "Adeyemi", "Mensah", "Williams", "Thompson", "Grant", "Bryan",
    "Daley", "Francis", "Richards",
    # European
    "Nowak", "Kowalski", "da Silva", "Fernandez", "Rossi", "Muller", "Andersen",
    "Petrov", "Ionescu", "Papadopoulos",
]


# --- UK Demographic Distributions ---

AGE_BRACKETS = ["18-24", "25-34", "35-49", "50-64", "65+"]
AGE_WEIGHTS = [13, 20, 20, 24, 23]

OCCUPATIONS = [
    "Professional (e.g. lawyer, doctor, engineer, teacher)",
    "Associate Professional/Technical (e.g. designer, IT technician, paramedic)",
    "Manager or Senior Official",
    "Administrative & Secretarial worker",
    "Caring & Leisure Services worker",
    "Skilled Trades worker (e.g. electrician, plumber, carpenter)",
    "Elementary Occupations worker (e.g. cleaner, warehouse operative)",
    "Sales & Customer Service worker",
    "Process/Plant/Machine Operative",
]
OCCUPATION_WEIGHTS = [27, 15, 11, 9, 9, 8, 9, 6, 6]

CUISINES = [
    "Italian (Pizza/Pasta)",
    "Indian & South Asian",
    "East Asian (Korean/Japanese)",
    "Nutrient-Dense / Gut Health",
    "Chinese",
    "Mexican / Tex-Mex",
    "Other (e.g. Malaysian, Brazilian, Middle Eastern)",
]
CUISINE_WEIGHTS = [22, 18, 15, 15, 12, 8, 10]

MUSIC_GENRES = ["Pop", "Rock", "Hip-Hop / Trap", "Dance/EDM", "Country/Folk Revival", "Classical", "R&B/Soul", "Jazz"]
MUSIC_WEIGHTS = [25, 20, 15, 12, 10, 8, 5, 5]

HOBBIES = [
    "Reading",
    "Walking/Hiking",
    "Gardening",
    "Baking/Cooking",
    "Arts & Crafts",
    "Gaming",
    "Sports/Fitness",
    "DIY/Home improvement",
    "Photography",
]
HOBBY_WEIGHTS = [25, 16, 15, 13, 8, 7, 7, 5, 4]


def sample_age(rng: random.Random) -> tuple[str, int]:
    """Return (bracket, specific_age)."""
    bracket = rng.choices(AGE_BRACKETS, weights=AGE_WEIGHTS, k=1)[0]
    if bracket == "18-24":
        age = rng.randint(18, 24)
    elif bracket == "25-34":
        age = rng.randint(25, 34)
    elif bracket == "35-49":
        age = rng.randint(35, 49)
    elif bracket == "50-64":
        age = rng.randint(50, 64)
    else:
        age = rng.randint(65, 85)
    return bracket, age


def sample_name(rng: random.Random, gender: str, bracket: str, used_first_names: set[str], used_full_names: set[str]) -> str:
    """Sample a unique full name, preferring unique first names too."""
    first_names = FIRST_NAMES[gender][bracket]
    # Try to find an unused first name + unused full name
    for _ in range(50):
        first = rng.choice(first_names)
        last = rng.choice(SURNAMES)
        full = f"{first} {last}"
        if first not in used_first_names and full not in used_full_names:
            used_first_names.add(first)
            used_full_names.add(full)
            return full
    # Relax: allow repeated first name but require unique full name
    for _ in range(50):
        first = rng.choice(first_names)
        last = rng.choice(SURNAMES)
        full = f"{first} {last}"
        if full not in used_full_names:
            used_first_names.add(first)
            used_full_names.add(full)
            return full
    return full


def sample_occupation(rng: random.Random, bracket: str, age: int) -> str:
    if bracket == "65+":
        former = rng.choices(OCCUPATIONS, weights=OCCUPATION_WEIGHTS, k=1)[0]
        return f"Retired (formerly {former})"
    if bracket == "18-24" and rng.random() < 0.30:
        return "University student"
    return rng.choices(OCCUPATIONS, weights=OCCUPATION_WEIGHTS, k=1)[0]


def sample_hobbies(rng: random.Random) -> list[str]:
    # Weighted sample without replacement
    available = list(HOBBIES)
    weights = list(HOBBY_WEIGHTS)
    picked = []
    for _ in range(2):
        choice = rng.choices(available, weights=weights, k=1)[0]
        idx = available.index(choice)
        picked.append(choice)
        available.pop(idx)
        weights.pop(idx)
    return picked


def build_prompt(name: str, description: str, gender: str, age: int, occupation: str, cuisine: str, music: str, hobbies: list[str]) -> str:
    return f"""Write a persona for this character. Their name is {name}. They are described as: "{description}"

Demographics:
- Gender: {gender}
- Age: {age}
- Occupation: {occupation}
- Favourite cuisine: {cuisine}
- Favourite music genre: {music}
- Hobbies: {hobbies[0]}, {hobbies[1]}

Rules:
- Write a single paragraph persona (3-4 sentences) that naturally weaves in their occupation, interests, and personality
- Do NOT mention their physical appearance (clothing, skin, hair) as that's already described elsewhere
- Make the persona feel like a real person living in the UK today
- The tone should be warm and human, not a list of facts

Reply in this exact JSON format:
{{"persona": "The persona paragraph."}}"""


SYSTEM_PROMPT = "You are a character designer creating brief, natural-sounding personas for characters in a simulation of UK society."


def generate_persona(client: OpenAI, prompt: str) -> dict:
    for attempt in range(MAX_RETRIES):
        try:
            response = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.9,
                max_tokens=300,
            )
            text = response.choices[0].message.content.strip()
            # Strip markdown code fences if present
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                text = text.rsplit("```", 1)[0].strip()
            return json.loads(text)
        except Exception as e:
            print(f"  Attempt {attempt + 1}/{MAX_RETRIES} failed: {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)
    return None


def main():
    rng = random.Random(SEED)
    client = OpenAI()

    with open(CHAR_JSON, "r") as f:
        data = json.load(f)

    used_first_names = set()
    used_full_names = set()
    total = END_ID - START_ID + 1
    for i, char_id in enumerate(range(START_ID, END_ID + 1)):
        key = f"character_{char_id:04d}"
        char = data["characters"][key]

        bracket, age = sample_age(rng)
        name = sample_name(rng, char["gender"], bracket, used_first_names, used_full_names)
        occupation = sample_occupation(rng, bracket, age)
        cuisine = rng.choices(CUISINES, weights=CUISINE_WEIGHTS, k=1)[0]
        music = rng.choices(MUSIC_GENRES, weights=MUSIC_WEIGHTS, k=1)[0]
        hobbies = sample_hobbies(rng)

        prompt = build_prompt(name, char["description"], char["gender"], age, occupation, cuisine, music, hobbies)
        result = generate_persona(client, prompt)

        if result is None:
            print(f"  WARNING: Failed to generate persona for {key}, skipping.")
            continue

        char["name"] = name
        char["persona"] = result["persona"]

        with open(CHAR_JSON, "w") as f:
            json.dump(data, f, indent=2)

        print(f"[{i + 1}/{total}] Generated persona for {key}: {name}")

    print("Done!")


if __name__ == "__main__":
    main()
