#!/usr/bin/env bash
# =====================================================================
# demo_api.sh - live walkthrough of the REST API for the Review 2 demonstration.
# Prerequisites: Neo4j running, data loaded (scripts/setup_db.py), API started (cd api && npm start).
# Usage:  bash demo/demo_api.sh            (press Enter between steps)
#         AUTO=1 bash demo/demo_api.sh     (no pauses)
# The script cleans up after itself, so the dataset is unchanged at the end.
# =====================================================================
API=${API:-http://localhost:3000/api}
KEY_HEADER=()
[ -n "$API_KEY" ] && KEY_HEADER=(-H "x-api-key: $API_KEY")

step() { echo; echo "================================================================"; echo "  $1"; echo "================================================================"; [ -z "$AUTO" ] && read -r -p "  (Enter) " _; }
call() { # method path [json]
  echo "> $1 $2"; [ -n "$3" ] && echo "  $3"
  if [ -n "$3" ]; then curl -s -X "$1" "${KEY_HEADER[@]}" -H 'Content-Type: application/json' -d "$3" -w '\n  HTTP %{http_code}\n' "$API$2";
  else curl -s -X "$1" "${KEY_HEADER[@]}" -w '\n  HTTP %{http_code}\n' "$API$2"; fi | sed 's/^/  /'
}

step "0. Health check - node and relationship counts"
call GET /health

step "1. CREATE a suspect (validated, typed properties)"
call POST /suspects '{"suspect_id":"S041","first_name":"Varun","last_name":"Kohli","alias":"Nomad","date_of_birth":"1990-06-18","gender":"Male","risk_level":"Medium","status":"Active"}'

step "1b. CREATE with bad data -> 400, duplicate key -> 409"
call POST /suspects '{"suspect_id":"S042","first_name":"X","risk_level":"Extreme","date_of_birth":"1990-02-30"}'
call POST /suspects '{"suspect_id":"S001","first_name":"Dup","last_name":"Key"}'

step "2. READ - one suspect, then a filtered list"
call GET /suspects/S041
call GET "/suspects?risk_level=High&limit=5"

step "3. UPDATE - partial update (the key cannot be changed)"
call PATCH /suspects/S041 '{"risk_level":"High","status":"Detained"}'
call PATCH /suspects/S041 '{"suspect_id":"S999"}'

step "4. Relationship CRUD - S041 KNOWS S011"
call POST /relationships/KNOWS '{"from":"S041","to":"S011","properties":{"connection_type":"Financial","since":"2024-01-15","strength":0.5}}'
call GET "/relationships/KNOWS?from=S041"
call PATCH /relationships/KNOWS '{"from":"S041","to":"S011","properties":{"strength":0.7}}'

step "5. DELETE - refused while relationships exist, then relationship delete + node delete"
call DELETE /suspects/S041
call DELETE "/relationships/KNOWS?from=S041&to=S011"
call DELETE /suspects/S041

step "6. TRANSACTION - register a complete case atomically (crime + location + lead + suspect + evidence)"
call POST /cases '{"crime":{"crime_id":"CR031","type":"Fraud","date":"2026-09-10","status":"Open","severity":3,"description":"UPI payment fraud targeting senior citizens"},"location_id":"L014","lead_officer":"B1202","time_of_day":"Evening","witness_count":0,"suspects":[{"suspect_id":"S011","role":"Principal","certainty_score":0.7}],"evidence":[{"evidence_id":"E017","relevance_score":0.6,"processing_status":"Pending"}]}'
call GET /crimes/CR031

step "6b. TRANSACTION - one bad reference rolls the WHOLE case back (CR032 is never created)"
call POST /cases '{"crime":{"crime_id":"CR032","type":"Theft","date":"2026-09-12"},"location_id":"L003","lead_officer":"B1207","suspects":[{"suspect_id":"S404"}]}'
call GET /crimes/CR032

step "6c. TRANSACTION - reassign the lead investigator atomically"
call PATCH /cases/CR031/lead '{"badge_number":"B1210"}'

step "6d. EXPLICIT TRANSACTION - begin, write, fail, rollback"
call POST /demo/rollback

step "7. Graph traversal & aggregation through the API"
call GET "/analytics/Q2?from=S002&to=S026"
call GET /analytics/Q6

step "Clean-up (remove CR031 created in step 6)"
call DELETE "/crimes/CR031?detach=true"
call GET /health
echo; echo "Demo complete."
