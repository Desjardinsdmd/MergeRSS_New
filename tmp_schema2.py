import json
E = 'base44/entities/'


def load(n):
    return json.load(open(E + n + '.jsonc'))


def save(n, d):
    json.dump(d, open(E + n + '.jsonc', 'w'), indent=2, ensure_ascii=False)


sh = load('SystemHealth')
jt = sh['properties']['job_type']
jt.pop('enum', None)
jt['description'] = 'Free-form job type. Was an enum of 4 values, which silently rejected clustering, scoring, recovery, migration and health logs.'
save('SystemHealth', sh)

s = load('Source')
print('source status', s['properties']['status'])
s['properties']['lease_owner'] = {'type': 'string'}
save('Source', s)

a = load('Article')
a['properties']['enrichment_status']['enum'] = ['pending', 'processing', 'done', 'fallback', 'failed', 'skipped']
a['properties']['enrich_lease_owner'] = {'type': 'string'}
a['properties']['scoring_lens'] = {'type': 'string'}
a['properties']['enrichment_source'] = {'type': 'string', 'enum': ['llm', 'legacy', 'migration']}
save('Article', a)
print('ok')
