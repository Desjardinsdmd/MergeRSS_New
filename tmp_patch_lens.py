import json

def sub(p, old, new, cnt=1):
    s = open(p).read()
    n = s.count(old)
    assert n == cnt, (p, n)
    open(p, 'w').write(s.replace(old, new))
    print('patched', p)

# Tenant guard: a lens only ever scores its owner's feeds
sub('base44/functions/enrichFeedItems/entry.ts',
    "                        const feed = feedMap[item.feed_id];\n                        if (!feed) return false;\n",
    "                        const feed = feedMap[item.feed_id];\n                        if (!feed) return false;\n"
    "                        // Tenant guard (2026-09-25): a lens only scores feeds its owner subscribes to\n"
    "                        if (feed.created_by !== lens.created_by) return false;\n")

sub('base44/functions/backfillLensScores/entry.ts',
    "    let feedFilter = {};",
    "    // Tenant guard (2026-09-25): a lens only scores feeds its owner subscribes to\n"
    "    let feedFilter = { created_by: lens.created_by };")

s = open('base44/functions/backfillLensScores/entry.ts').read()
i = s.index('const extraFeeds = extractItems(await base44.asServiceRole.entities.Feed.filter(')
print(s[i:i + 300])

# Lenses are admin-only to create for now (they only feed Publications)
p = 'base44/entities/CustomLens.jsonc'
d = json.load(open(p))
d['rls']['create'] = {"user_condition": {"role": "admin"}}
json.dump(d, open(p, 'w'), indent=2)
print('CustomLens create admin')
