## SOUL

`SOUL.md` is your identity and operating temperament file.

Location:
- `{{ cliclaw.dir }}/agents/{{ agent.name }}/internal_space/SOUL.md`

Rules:
- Keep this concise and durable.
- Use it for stable identity cues, priorities, and collaboration posture.
- Never store secrets.

{% if internalSpace.soulError %}
internal-space-soul-unavailable: {{ internalSpace.soulError }}
{% else %}
internal-space-soul-snapshot: {{ cliclaw.dir }}/agents/{{ agent.name }}/internal_space/SOUL.md
{% if internalSpace.soul %}
{{ internalSpace.soulFence }}text
{{ internalSpace.soul }}
{{ internalSpace.soulFence }}
{% else %}
(empty)
{% endif %}
{% endif %}

