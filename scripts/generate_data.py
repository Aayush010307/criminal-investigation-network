#!/usr/bin/env python3
"""
generate_data.py
----------------
Generates the synthetic Criminal Investigation Network dataset as CSV files in ../data.

* Deterministic: a fixed seed and curated value lists (instead of Faker) guarantee that
  every team member - and the evaluator - obtains byte-identical CSVs, so the query
  results recorded in the Review 2 report are reproducible.
* Volume (matches Review 1, Table 5.1): 140 nodes, 240 relationships.
* Structure: three syndicate clusters with one broker each, a few bridging suspects,
  cross-case evidence and ~10 % of crimes without an identified suspect.

All data is fictitious. Any resemblance to real persons is coincidental.
"""
import csv, os, random
from datetime import date, timedelta

SEED = 2025
rng = random.Random(SEED)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")

def d(s):  # ISO string -> date
    return date.fromisoformat(s)

def rand_date(lo, hi):
    lo, hi = d(lo), d(hi)
    return lo + timedelta(days=rng.randrange((hi - lo).days + 1))

# ------------------------------------------------------------------ Officers (15)
officers = [
    ("B1201", "Insp. A. Nair",       "Inspector",           "Crime Branch",      "a.nair@police.example",       14),
    ("B1202", "SI. K. Fernandes",    "Sub-Inspector",       "Cyber Cell",        "k.fernandes@police.example",   6),
    ("B1203", "Insp. R. Iyer",       "Inspector",           "Narcotics Bureau",  "r.iyer@police.example",       11),
    ("B1204", "SI. P. Kulkarni",     "Sub-Inspector",       "Narcotics Bureau",  "p.kulkarni@police.example",    5),
    ("B1205", "ACP. M. Reddy",       "Assistant Commissioner", "Homicide Division", "m.reddy@police.example",   19),
    ("B1206", "Insp. S. Banerjee",   "Inspector",           "Homicide Division", "s.banerjee@police.example",   12),
    ("B1207", "SI. N. Gupta",        "Sub-Inspector",       "Anti-Theft Squad",  "n.gupta@police.example",       4),
    ("B1208", "Insp. V. Pillai",     "Inspector",           "Anti-Theft Squad",  "v.pillai@police.example",      9),
    ("B1209", "ASI. D. Joshi",       "Assistant Sub-Inspector", "Anti-Theft Squad", "d.joshi@police.example",    3),
    ("B1210", "Insp. H. Khan",       "Inspector",           "Cyber Cell",        "h.khan@police.example",       10),
    ("B1211", "SI. L. D'Souza",      "Sub-Inspector",       "Cyber Cell",        "l.dsouza@police.example",      7),
    ("B1212", "Insp. T. Rao",        "Inspector",           "Crime Branch",      "t.rao@police.example",        13),
    ("B1213", "SI. G. Mehta",        "Sub-Inspector",       "Crime Branch",      "g.mehta@police.example",       5),
    ("B1214", "SI. J. Thomas",       "Sub-Inspector",       "Narcotics Bureau",  "j.thomas@police.example",      8),
    ("B1215", "ASI. Y. Verma",       "Assistant Sub-Inspector", "Crime Branch",  "y.verma@police.example",       2),
]
DEPT_FOR_TYPE = {
    "Narcotics": ["B1203", "B1204", "B1214"],
    "Fraud":     ["B1202", "B1210", "B1211"],
    "Theft":     ["B1207", "B1208", "B1209"],
    "Assault":   ["B1212", "B1213", "B1215"],
    "Homicide":  ["B1205", "B1206"],
}

# ------------------------------------------------------------------ Locations (20)
locations = [
    ("L001", "12 MG Road",              "Bengaluru", "560001", 12.9758, 77.6045, "Commercial"),
    ("L002", "48 Anna Salai",           "Chennai",   "600002", 13.0604, 80.2496, "Public"),
    ("L003", "7 Brigade Road",          "Bengaluru", "560025", 12.9716, 77.6070, "Commercial"),
    ("L004", "22 Koramangala 5th Block","Bengaluru", "560095", 12.9352, 77.6245, "Residential"),
    ("L005", "Majestic Bus Terminal",   "Bengaluru", "560009", 12.9767, 77.5713, "Public"),
    ("L006", "15 T. Nagar Main Road",   "Chennai",   "600017", 13.0418, 80.2341, "Commercial"),
    ("L007", "3 Besant Nagar Beach Rd", "Chennai",   "600090", 13.0002, 80.2668, "Public"),
    ("L008", "91 Adyar Gandhi Nagar",   "Chennai",   "600020", 13.0067, 80.2573, "Residential"),
    ("L009", "Dadar Railway Station",   "Mumbai",    "400014", 19.0178, 72.8478, "Public"),
    ("L010", "210 Linking Road, Bandra","Mumbai",    "400050", 19.0596, 72.8295, "Commercial"),
    ("L011", "5 Andheri East, MIDC",    "Mumbai",    "400093", 19.1136, 72.8697, "Commercial"),
    ("L012", "44 Banjara Hills Rd 12",  "Hyderabad", "500034", 17.4126, 78.4482, "Residential"),
    ("L013", "Charminar Market",        "Hyderabad", "500002", 17.3616, 78.4747, "Public"),
    ("L014", "8 HITEC City Phase 2",    "Hyderabad", "500081", 17.4435, 78.3772, "Commercial"),
    ("L015", "31 FC Road, Shivajinagar","Pune",      "411004", 18.5236, 73.8413, "Commercial"),
    ("L016", "17 Koregaon Park Lane 6", "Pune",      "411001", 18.5362, 73.8940, "Residential"),
    ("L017", "Connaught Place Block C", "New Delhi", "110001", 28.6315, 77.2167, "Commercial"),
    ("L018", "66 Lajpat Nagar II",      "New Delhi", "110024", 28.5677, 77.2433, "Residential"),
    ("L019", "Chandni Chowk Market",    "New Delhi", "110006", 28.6506, 77.2303, "Public"),
    ("L020", "9 Whitefield Main Road",  "Bengaluru", "560066", 12.9698, 77.7500, "Residential"),
]

# ------------------------------------------------------------------ Suspects (40)
FIRST_M = ["Arjun","Vikram","Suresh","Manoj","Karthik","Ravi","Sanjay","Nikhil","Ajay","Rohit",
           "Pradeep","Harish","Ganesh","Anil","Mohan","Sameer","Rakesh","Vinod","Ashok","Naveen",
           "Tarun","Gopal","Ramesh","Dinesh","Kunal","Yusuf","Salim","Joseph","Prakash","Abhishek"]
FIRST_F = ["Priya","Neha","Kavya","Anjali","Divya","Sneha","Pooja","Meera","Lakshmi","Farah"]
LAST = ["Sharma","Reddy","Nair","Pillai","Das","Patil","Singh","Khan","Joshi","Iyer","Kumar","Bose",
        "Chauhan","Varghese","Mishra","Shetty","Gowda","Naidu","Pandey","Ali","Mathew","Yadav",
        "Kapoor","Rathod","Saxena","Hegde","Bhat","Thakur","Menezes","Ansari"]
ALIASES = ["Tiger","Shadow","Lucky","Blade","Viper","Cobra","Raja","Babloo","Munna","Pappu","Chhota",
           "Bullet","Jackal","Ice","Hawk","Sultan","Smoke","Joker","Rocky","Scar","Pintu","Tony",
           "Lion","Guru","Don","Chintu","Spark","Monk","Bhai","Tiny","Duke","Fox","Nawab","Doc",
           "Mantri","Seth"]

fixed_suspects = {
    "S001": ("Rahul",  "Menon",   "Ghost",  "1988-03-14", "Male", "High",   "Active"),
    "S002": ("Imran",  "Qureshi", "Falcon", "1992-11-02", "Male", "Medium", "Active"),
    "S003": ("Deepak", "Rao",     "Chotu",  "1995-07-21", "Male", "Low",    "Cleared"),
    "S004": ("Farhan", "Sheikh",  "Kaka",   "1984-01-09", "Male", "High",   "Detained"),
}
SYNDICATES = {
    "A": [f"S{i:03d}" for i in range(1, 11)],    # Narcotics network, broker S001
    "B": [f"S{i:03d}" for i in range(11, 20)],   # Financial-fraud ring, broker S011
    "C": [f"S{i:03d}" for i in range(20, 30)],   # Street theft & assault gang, broker S020
    "U": [f"S{i:03d}" for i in range(30, 41)],   # Unaffiliated individuals
}
BROKERS = {"A": "S001", "B": "S011", "C": "S020"}
group_of = {s: g for g, ms in SYNDICATES.items() for s in ms}

used_alias = {v[2] for v in fixed_suspects.values()}
alias_pool = [a for a in ALIASES if a not in used_alias]
rng.shuffle(alias_pool)
suspects = []
for i in range(1, 41):
    sid = f"S{i:03d}"
    if sid in fixed_suspects:
        fn, ln, al, dob, g, risk, st = fixed_suspects[sid]
    else:
        g = "Female" if rng.random() < 0.2 else "Male"
        fn = rng.choice(FIRST_F if g == "Female" else FIRST_M)
        ln = rng.choice(LAST)
        al = alias_pool.pop()
        dob = rand_date("1970-01-01", "2003-12-31").isoformat()
        grp = group_of[sid]
        if sid in BROKERS.values():
            risk = "High"
        elif grp == "U":
            risk = rng.choice(["Low", "Low", "Medium"])
        else:
            risk = rng.choice(["Low", "Medium", "Medium", "High"])
        st = rng.choice(["Active", "Active", "Detained", "Cleared"]) if grp != "U" else rng.choice(["Active", "Cleared", "Cleared"])
        if sid in BROKERS.values():
            st = "Active"
    suspects.append([sid, fn, ln, al, dob, g, risk, st])

# ------------------------------------------------------------------ KNOWS (60)
knows = {}   # frozenset -> (a, b, type, since, strength)
def add_knows(a, b, ctype=None, since=None, strength=None):
    key = frozenset((a, b))
    if a == b or key in knows:
        return False
    ctype = ctype or rng.choice(["Associate", "Associate", "Family", "Cellmate", "Financial"])
    since = since or rand_date("2012-01-01", "2024-12-31").isoformat()
    strength = strength if strength is not None else round(rng.uniform(0.35, 0.95), 2)
    knows[key] = (a, b, ctype, since, strength)
    return True

add_knows("S001", "S004", "Associate", "2019-05-02", 0.75)   # Review 1 sample instance
TARGET = {"A": 17, "B": 14, "C": 16}
STAR = {"A": 8, "B": 7, "C": 8}
for g, target in TARGET.items():
    members, broker = SYNDICATES[g], BROKERS[g]
    others = [m for m in members if m != broker]
    for m in others[:STAR[g]]:                             # broker star
        add_knows(broker, m, strength=round(rng.uniform(0.7, 0.95), 2))
    while sum(1 for k in knows if all(group_of[x] == g for x in k)) < target:
        a, b = rng.sample(others, 2)
        add_knows(a, b)
# bridges between clusters (3)
add_knows("S007", "S015", "Financial", "2021-08-14", 0.55)   # narcotics money laundered via fraud ring
add_knows("S018", "S024", "Cellmate",  "2020-02-03", 0.48)   # fraud ring <-> street gang
add_knows("S009", "S027", "Family",    "2016-11-20", 0.62)   # narcotics <-> street gang
# unaffiliated individuals (10): small pairs/triads, two weak links into clusters, some isolates
for a, b in [("S030","S031"),("S031","S032"),("S030","S032"),("S033","S034"),("S035","S036"),
             ("S036","S037"),("S033","S025"),("S037","S013"),("S034","S035"),("S031","S022")]:
    add_knows(a, b)
assert len(knows) == 60, len(knows)

# ------------------------------------------------------------------ Crimes (30)
DESCR = {
    "Theft":     ["Chain snatching near a bus stop", "Two-wheeler theft from a parking lot", "Break-in at a residential flat",
                  "Pickpocketing ring at a market", "Theft of laptops from an office", "Mobile phones stolen from a showroom",
                  "Car stereo theft in a basement parking", "Jewellery stolen from a locked house",
                  "Copper cable theft from a construction site", "Bag lifting on a crowded train",
                  "Cash stolen from a petrol pump counter", "ATM cash-box tampering"],
    "Assault":   ["Street fight with injuries", "Attack on a shopkeeper", "Assault during a robbery attempt",
                  "Road-rage assault on a cab driver", "Assault on a security guard", "Group attack outside a bar"],
    "Fraud":     ["Online lottery scam", "Forged property documents", "Credit-card skimming at an ATM",
                  "Fake investment scheme", "Phishing of bank customers", "Loan-app extortion racket",
                  "Insurance claim fraud"],
    "Narcotics": ["Drug consignment intercepted at a terminal", "Narcotics sale near a college",
                  "Warehouse storing contraband", "Courier parcels carrying narcotics", "Drug peddling at a nightlife venue",
                  "Synthetic drug lab raided"],
    "Homicide":  ["Body recovered near a lake", "Fatal stabbing in a residential lane"],
}
_descr_pool = {}
def next_descr(t):
    if not _descr_pool.get(t):
        _descr_pool[t] = DESCR[t][:]
        rng.shuffle(_descr_pool[t])
    return _descr_pool[t].pop()
SEV = {"Theft": (1, 3), "Fraud": (2, 4), "Assault": (3, 4), "Narcotics": (3, 5), "Homicide": (5, 5)}
fixed_crimes = {
    "CR001": ("Theft",     "2025-02-11", "Closed",              2, "Burglary at a retail outlet",      "C", "L003"),
    "CR002": ("Narcotics", "2025-04-27", "Under Investigation", 4, "Seizure during a routine patrol",   "A", "L001"),
    "CR003": ("Fraud",     "2025-06-05", "Open",                3, "Fraudulent bank transfers",        "B", "L014"),
    "CR004": ("Assault",   "2025-08-19", "Under Investigation", 4, "Assault outside a nightclub",      "C", "L003"),
}
# (type, group, location) for CR005..CR030 - hotspots deliberately repeated
plan = [
    ("Narcotics","A","L005"),("Narcotics","A","L001"),("Assault","A","L009"),("Narcotics","A","L009"),
    ("Narcotics","A","L005"),("Narcotics","A","L011"),("Assault","A","L001"),
    ("Fraud","B","L014"),("Fraud","B","L010"),("Fraud","B","L017"),("Fraud","B","L012"),
    ("Fraud","B","L014"),("Fraud","B","L006"),
    ("Theft","C","L003"),("Theft","C","L006"),("Theft","C","L013"),("Assault","C","L019"),
    ("Theft","C","L004"),("Theft","C","L015"),("Theft","C","L019"),
    ("Theft","U","L001"),("Assault","U","L007"),("Theft","U","L016"),
    ("Homicide","U","L008"),("Homicide","U","L018"),("Theft","U","L002"),
]
assert len(plan) == 26
crimes = []          # crime_id, type, date, status, severity, description
crime_meta = {}      # crime_id -> (group, location)
for cid, (t, dt, st, sev, desc, g, loc) in fixed_crimes.items():
    crimes.append([cid, t, dt, st, sev, desc]); crime_meta[cid] = (g, loc)
for n, (t, g, loc) in enumerate(plan, start=5):
    cid = f"CR{n:03d}"
    dt = rand_date("2025-01-01", "2026-08-31")
    age = (d("2026-09-01") - dt).days
    st = rng.choice(["Closed", "Closed", "Under Investigation"]) if age > 300 else rng.choice(["Open", "Under Investigation", "Under Investigation"])
    lo, hi = SEV[t]
    crimes.append([cid, t, dt.isoformat(), st, rng.randint(lo, hi), next_descr(t)])
    crime_meta[cid] = (g, loc)
crime_by_id = {c[0]: c for c in crimes}

# ------------------------------------------------------------------ COMMITTED (45)
UNSOLVED = {"CR028", "CR029", "CR030"}      # 10 % of crimes with no identified suspect
committed = {}   # (sid, cid) -> row
def add_comm(sid, cid, role, cert=None, charged=None):
    if (sid, cid) in committed:
        return False
    cert = cert if cert is not None else round(rng.uniform(0.45, 0.97), 2)
    if charged is None:
        charged = crime_by_id[cid][3] == "Closed" or cert >= 0.85
    committed[(sid, cid)] = [sid, cid, role, cert, str(charged).lower()]
    return True

add_comm("S001", "CR002", "Principal", 0.88, True)       # Review 1 sample instance
add_comm("S004", "CR002", "Accomplice", 0.72, False)
add_comm("S020", "CR001", "Principal", 0.81, True)
add_comm("S023", "CR004", "Principal", 0.9, True)
add_comm("S011", "CR003", "Principal", 0.67, False)
# every other solved crime gets a principal from its group
for c in crimes:
    cid = c[0]
    if cid in UNSOLVED or any(k[1] == cid for k in committed):
        continue
    g = crime_meta[cid][0]
    add_comm(rng.choice(SYNDICATES[g]), cid, "Principal")
# brokers orchestrate several crimes of their own cluster
for g, broker in BROKERS.items():
    own = [c[0] for c in crimes if crime_meta[c[0]][0] == g and c[0] not in UNSOLVED]
    for cid in rng.sample(own, 2):
        add_comm(broker, cid, "Accessory")
# fill up to 45 with accomplices from the same group
solved = [c[0] for c in crimes if c[0] not in UNSOLVED]
while len(committed) < 45:
    cid = rng.choice(solved)
    g = crime_meta[cid][0]
    add_comm(rng.choice(SYNDICATES[g]), cid, rng.choice(["Accomplice", "Accomplice", "Accessory"]))
assert len(committed) == 45

# ------------------------------------------------------------------ OCCURRED_AT (30)
occurred = []
for c in crimes:
    cid = c[0]
    tod = "Night" if cid == "CR002" else rng.choice(["Morning", "Afternoon", "Evening", "Night", "Night"])
    wc = 2 if cid == "CR002" else rng.randint(0, 6)
    occurred.append([cid, crime_meta[cid][1], tod, wc])

# ------------------------------------------------------------------ INVESTIGATING (35)
investigating = []
lead_of = {}
for c in crimes:
    cid, t, dt = c[0], c[1], d(c[2])
    lead = "B1201" if cid == "CR002" else rng.choice(DEPT_FOR_TYPE[t])
    ad = "2025-04-28" if cid == "CR002" else (dt + timedelta(days=rng.randint(0, 3))).isoformat()
    investigating.append([lead, cid, ad, "true"])
    lead_of[cid] = lead
support = [("B1213", "CR002"), ("B1202", "CR003"), ("B1215", "CR004"), ("B1212", "CR027"), ("B1210", "CR014")]
for off, cid in support:
    dt = d(crime_by_id[cid][2])
    investigating.append([off, cid, (dt + timedelta(days=rng.randint(2, 10))).isoformat(), "false"])
assert len(investigating) == 35

# ------------------------------------------------------------------ Evidence (35), LINKED_TO (40), FOUND_AT (30)
EV_TYPES = {
    "Theft":     [("Digital", "CCTV footage of the premises"), ("Document", "Pawn-shop receipt for stolen jewellery"),
                  ("Biological", "Fingerprints lifted from the entry point"), ("Weapon", "Crowbar used for forced entry"),
                  ("Digital", "GPS tracker log of the stolen vehicle"), ("Document", "Handwritten list of target houses"),
                  ("Biological", "Shoe-print cast from the window ledge")],
    "Assault":   [("Weapon", "Iron rod recovered from the scene"), ("Biological", "Blood-stained clothing"),
                  ("Digital", "Mobile video recorded by a bystander"), ("Weapon", "Broken glass bottle"),
                  ("Document", "Medico-legal certificate of the victim")],
    "Fraud":     [("Document", "Forged identity documents"), ("Digital", "Laptop with phishing kit"),
                  ("Document", "Cheque book with forged signatures"), ("Digital", "Card-skimming device"),
                  ("Digital", "SIM cards registered under false names"), ("Document", "Fake investment brochures"),
                  ("Digital", "Spreadsheet of victims' account numbers")],
    "Narcotics": [("Document", "Handwritten supply ledger"), ("Digital", "Burner phone with dealer contacts"),
                  ("Biological", "Seized substance sample"), ("Document", "Courier receipts for concealed parcels"),
                  ("Digital", "Encrypted messaging backup"), ("Weapon", "Unlicensed pistol found with the consignment")],
    "Homicide":  [("Weapon", "Knife with partial prints"), ("Biological", "DNA sample from the victim's nails"),
                  ("Digital", "Last known call records of the victim")],
}
evidence, linked, found = [], [], []
def add_ev(eid, cid, etype, desc, cdate, custody, found_loc, rel, pstat):
    evidence.append([eid, etype, desc, cdate, custody])
    linked.append([eid, cid, rel, pstat])
    if found_loc:
        found.append([eid, found_loc, lead_of[cid], cdate])

add_ev("E001", "CR004", "Weapon",  "Recovered kitchen knife",         "2025-08-20", "In Lab",   "L003", 0.86, "Pending")
add_ev("E002", "CR002", "Digital", "Mobile handset with call log",    "2025-04-28", "Archived", "L001", 0.91, "Analysed")
found[-1][2] = "B1201"
# evidence obtained through warrants / subpoenas - no physical recovery location (5)
NO_LOC = {"E010", "E017", "E021", "E026", "E033"}
crime_cycle = [c[0] for c in crimes if c[0] not in ("CR002", "CR004")]
rng.shuffle(crime_cycle)
crime_cycle = (crime_cycle + ["CR002", "CR003", "CR005", "CR009", "CR014"])[:33]
for n, cid in enumerate(crime_cycle, start=3):
    eid = f"E{n:03d}"
    t, dt = crime_by_id[cid][1], d(crime_by_id[cid][2])
    etype, desc = rng.choice(EV_TYPES[t])
    if eid in NO_LOC:
        etype, desc = ("Document", "Bank statements obtained under warrant") if t == "Fraud" else ("Digital", "Call-detail records obtained under subpoena")
        loc = None
    else:
        crime_loc = crime_meta[cid][1]
        loc = crime_loc if rng.random() < 0.75 else rng.choice([l[0] for l in locations if l[0] != crime_loc])
    cdate = (dt + timedelta(days=rng.randint(0, 4))).isoformat()
    custody = rng.choice(["In Lab", "Archived", "Archived", "Released"]) if crime_by_id[cid][3] == "Closed" else rng.choice(["In Lab", "In Lab", "Archived"])
    pstat = rng.choice(["Analysed", "Analysed", "Pending", "Inconclusive"])
    add_ev(eid, cid, etype, desc, cdate, custody, loc, round(rng.uniform(0.4, 0.95), 2), pstat)
assert len(evidence) == 35 and len(found) == 30, (len(evidence), len(found))
# cross-case evidence (5 extra LINKED_TO) - the same item connects two separate crimes
ev_crime = {l[0]: l[1] for l in linked}
cross = []
for eid, _ in [(e[0], None) for e in evidence]:
    if len(cross) == 5:
        break
    cid = ev_crime[eid]
    g, t = crime_meta[cid][0], crime_by_id[cid][1]
    if g == "U" or eid in ("E001",):
        continue
    candidates = [c[0] for c in crimes if crime_meta[c[0]][0] == g and c[1] == t and c[0] != cid and c[0] not in UNSOLVED]
    if not candidates:
        continue
    other = rng.choice(candidates)
    if other in [x[1] for x in cross if x[0] == eid]:
        continue
    cross.append((eid, other))
    linked.append([eid, other, round(rng.uniform(0.4, 0.8), 2), "Pending"])
assert len(linked) == 40

# ------------------------------------------------------------------ write CSVs
def write(name, header, rows):
    with open(os.path.join(OUT, name), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(header); w.writerows(rows)

os.makedirs(OUT, exist_ok=True)
write("suspects.csv",  ["suspect_id","first_name","last_name","alias","date_of_birth","gender","risk_level","status"], suspects)
write("crimes.csv",    ["crime_id","type","date","status","severity","description"], crimes)
write("locations.csv", ["location_id","address","city","zipcode","latitude","longitude","area_type"], locations)
write("evidence.csv",  ["evidence_id","type","description","collection_date","custody_status"], evidence)
write("officers.csv",  ["badge_number","name","rank","department","contact_info","years_of_service"], officers)
write("rel_knows.csv",         ["from_id","to_id","connection_type","since","strength"], [list(v) for v in knows.values()])
write("rel_committed.csv",     ["suspect_id","crime_id","role","certainty_score","charged"], list(committed.values()))
write("rel_occurred_at.csv",   ["crime_id","location_id","time_of_day","witness_count"], occurred)
write("rel_linked_to.csv",     ["evidence_id","crime_id","relevance_score","processing_status"], linked)
write("rel_investigating.csv", ["badge_number","crime_id","assigned_date","lead_investigator"], investigating)
write("rel_found_at.csv",      ["evidence_id","location_id","found_by","found_on"], found)

nodes = len(suspects) + len(crimes) + len(locations) + len(evidence) + len(officers)
rels = len(knows) + len(committed) + len(occurred) + len(linked) + len(investigating) + len(found)
print(f"Generated {nodes} nodes and {rels} relationships into {os.path.normpath(OUT)}")
