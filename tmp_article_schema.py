import json

E = 'base44/entities'
ADMIN = {"user_condition": {"role": "admin"}}


def own(field):
    return {"$or": [{f"data.{field}": "{{user.email}}"}, ADMIN]}


ADMIN_ONLY = {"create": ADMIN, "read": ADMIN, "update": ADMIN, "delete": ADMIN}
TAG = {"type": "string", "enum": ["Trending", "Risk", "Opportunity", "Neutral"]}


def save(name, doc):
    json.dump({"name": name, "type": "object", **doc}, open(f'{E}/{name}.jsonc', 'w'), indent=2, ensure_ascii=False)
    print('wrote', name)


# One row per real-world article, deduplicated by canonical URL across ALL sources.
# Scored once. Users never read this table directly: functions resolve access
# through Subscription -> Source -> SourceItem -> Article.
save('Article', {
    "description": "One row per unique article (keyed by url_key). Shared enrichment, scored once regardless of how many sources or users carry it.",
    "properties": {
        "url_key": {"type": "string", "description": "Dedup key: normalized canonical URL (host lowercase, no www, no tracking params, no trailing slash)"},
        "url": {"type": "string"},
        "title": {"type": "string"},
        "description": {"type": "string"},
        "content": {"type": "string"},
        "author": {"type": "string"},
        "published_date": {"type": "string", "format": "date-time"},
        "first_seen_at": {"type": "string", "format": "date-time"},
        "category": {"type": "string"},
        "entities": {"type": "array", "items": {"type": "string"}},
        "ai_summary": {"type": "string"},
        "importance_score": {"type": "number"},
        "intelligence_tag": TAG,
        "enrichment_status": {"type": "string", "enum": ["pending", "processing", "done", "fallback", "failed"], "default": "pending"},
        "enrichment_attempts": {"type": "number", "default": 0},
        "enrich_lease_until": {"type": "string", "format": "date-time"},
        "source_count": {"type": "number", "default": 1},
        "legacy_item_ids": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["url_key", "title"],
    "rls": ADMIN_ONLY,
})

# Link: which Source carried which Article (an article can appear in many sources).
save('SourceItem', {
    "description": "Link between a Source and an Article it published. Queried by source_id + published_date to build a user's feed.",
    "properties": {
        "source_id": {"type": "string"},
        "article_id": {"type": "string"},
        "guid": {"type": "string"},
        "published_date": {"type": "string", "format": "date-time"},
        "fetched_at": {"type": "string", "format": "date-time"},
        "legacy_item_id": {"type": "string"},
    },
    "required": ["source_id", "article_id"],
    "rls": ADMIN_ONLY,
})

save('UserItemState', {
    "description": "Per-user state on a shared Article (read, saved). Saved articles are never pruned by retention.",
    "properties": {
        "user_email": {"type": "string"},
        "article_id": {"type": "string"},
        "is_read": {"type": "boolean", "default": False},
        "is_saved": {"type": "boolean", "default": False},
        "read_at": {"type": "string", "format": "date-time"},
        "legacy_item_id": {"type": "string"},
    },
    "required": ["user_email", "article_id"],
    "rls": {"create": own('user_email'), "read": own('user_email'), "update": own('user_email'), "delete": own('user_email')},
})

save('LensScore', {
    "description": "A lens owner's score for a shared Article. Replaces custom_lens_scores arrays embedded on shared items.",
    "properties": {
        "lens_id": {"type": "string"},
        "owner_email": {"type": "string"},
        "article_id": {"type": "string"},
        "importance_score": {"type": "number"},
        "intelligence_tag": TAG,
        "ai_summary": {"type": "string"},
        "structured_metadata": {"type": "object", "additionalProperties": True},
        "scored_at": {"type": "string", "format": "date-time"},
    },
    "required": ["lens_id", "owner_email", "article_id"],
    "rls": {"create": ADMIN, "read": own('owner_email'), "update": ADMIN, "delete": own('owner_email')},
})
