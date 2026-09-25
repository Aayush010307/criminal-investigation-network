/**
 * schema.js - single definition of the graph model used by every route.
 * Labels and relationship types can NOT be passed as Cypher parameters, so routes only ever
 * interpolate values taken from these whitelists - user input never reaches the query text.
 */
const RISK = ['Low', 'Medium', 'High'];

const ENTITIES = {
  suspects: {
    label: 'Suspect', key: 'suspect_id', keyPattern: /^S\d{3,}$/,
    required: ['suspect_id', 'first_name', 'last_name'],
    filters: ['risk_level', 'status', 'gender'],
    props: {
      suspect_id: 'string', first_name: 'string', last_name: 'string', alias: 'string',
      date_of_birth: 'date', gender: { enum: ['Male', 'Female', 'Other'] },
      risk_level: { enum: RISK }, status: { enum: ['Active', 'Detained', 'Cleared'] },
    },
  },
  crimes: {
    label: 'Crime', key: 'crime_id', keyPattern: /^CR\d{3,}$/,
    required: ['crime_id', 'type', 'date'],
    filters: ['type', 'status', 'severity'],
    props: {
      crime_id: 'string', type: { enum: ['Theft', 'Assault', 'Fraud', 'Narcotics', 'Homicide'] },
      date: 'date', status: { enum: ['Open', 'Under Investigation', 'Closed'] },
      severity: { int: [1, 5] }, description: 'string',
    },
  },
  locations: {
    label: 'Location', key: 'location_id', keyPattern: /^L\d{3,}$/,
    required: ['location_id', 'address', 'city'],
    filters: ['city', 'area_type'],
    props: {
      location_id: 'string', address: 'string', city: 'string', zipcode: 'string',
      latitude: { float: [-90, 90] }, longitude: { float: [-180, 180] },
      area_type: { enum: ['Residential', 'Commercial', 'Public'] },
    },
  },
  evidence: {
    label: 'Evidence', key: 'evidence_id', keyPattern: /^E\d{3,}$/,
    required: ['evidence_id', 'type'],
    filters: ['type', 'custody_status'],
    props: {
      evidence_id: 'string', type: { enum: ['Weapon', 'Document', 'Digital', 'Biological'] },
      description: 'string', collection_date: 'date',
      custody_status: { enum: ['In Lab', 'Archived', 'Released'] },
    },
  },
  officers: {
    label: 'Officer', key: 'badge_number', keyPattern: /^B\d{4,}$/,
    required: ['badge_number', 'name'],
    filters: ['department', 'rank'],
    props: {
      badge_number: 'string', name: 'string', rank: 'string', department: 'string',
      contact_info: 'string', years_of_service: { int: [0, 60] },
    },
  },
};

const RELATIONSHIPS = {
  COMMITTED: {
    from: 'suspects', to: 'crimes', directed: true,
    props: { role: { enum: ['Principal', 'Accomplice', 'Accessory'] }, certainty_score: { float: [0, 1] }, charged: 'boolean' },
  },
  KNOWS: {
    from: 'suspects', to: 'suspects', directed: false,
    props: { connection_type: { enum: ['Family', 'Associate', 'Cellmate', 'Financial'] }, since: 'date', strength: { float: [0, 1] } },
  },
  OCCURRED_AT: {
    from: 'crimes', to: 'locations', directed: true,
    props: { time_of_day: { enum: ['Morning', 'Afternoon', 'Evening', 'Night'] }, witness_count: { int: [0, 1000] } },
  },
  LINKED_TO: {
    from: 'evidence', to: 'crimes', directed: true,
    props: { relevance_score: { float: [0, 1] }, processing_status: { enum: ['Pending', 'Analysed', 'Inconclusive'] } },
  },
  INVESTIGATING: {
    from: 'officers', to: 'crimes', directed: true,
    props: { assigned_date: 'date', lead_investigator: 'boolean' },
  },
  FOUND_AT: {
    from: 'evidence', to: 'locations', directed: true,
    props: { found_by: 'string', found_on: 'date' },
  },
};

module.exports = { ENTITIES, RELATIONSHIPS };
