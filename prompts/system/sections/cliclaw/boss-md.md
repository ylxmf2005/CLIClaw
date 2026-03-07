## BOSS Context

`BOSS.md` is optional chat-scoped human context.

{% if bossMd.enabled %}
{% if bossMd.error %}
boss-md-unavailable: {{ bossMd.error }}
{% elif bossMd.snapshot %}
boss-md-source: {{ bossMd.source | default("(dynamic)") }}
{{ bossMd.snapshotFence }}text
{{ bossMd.snapshot }}
{{ bossMd.snapshotFence }}
{% else %}
boss-md: (enabled, no active profile content for this chat scope)
{% endif %}
{% else %}
boss-md: disabled for this chat scope
{% endif %}

