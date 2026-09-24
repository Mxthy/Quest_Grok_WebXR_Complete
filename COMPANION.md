# Companion architecture (adult sim)

$$
\text{gute Companion-App} =
\text{Persona-Konsistenz}
+ \text{strukturierte Erinnerung}
+ \text{Zustandsmaschine}
+ \text{harte Grenzen}
+ \text{Datensparsamkeit}
$$

## Layers

| Layer | Code |
|-------|------|
| Identity | `config/companion-persona.json`, `src/companion/identity.ts` |
| Session | short working memory in `src/llm/memoryStore.ts` |
| Memory | `src/companion/memory/structuredMemory.ts` (semantic + episodic) |
| Boundary | intimacy + persona + `prePolicy` / `postPolicy` |
| Emotion | `src/companion/stateMachine.ts` + reactions |
| Privacy | `src/companion/privacy/policy.ts` + Privacy UI |
| Simulation | apartment engine + companion sync |
| UI | HUD, LlmDialoguePanel, CompanionPrivacyPanel |

## State variables

Presence · Trust · Warmth · Topic Safety · Memory Confidence · Vulnerability · Consent Scope · **Girlfriend Affection**

## Memory policy

- Raw chat: ~24h then drop (`raw_transcript_retention_hours`)
- Semantic facts: user-editable
- Episodic: compressed moments only
- `train_on_user_content: false`

## Girlfriend affection + reactions

`girlfriendAffection` maps from sim affection (0–300 → 0–100).  
Events `touch_ok | touch_blocked | gift | pause_respected | rushed` update trust + lastReaction coherently with zones/LLM.


## Immersion director

`src/systems/immersionSystem.ts` ties companion state to continuous feel:

- Breath rate + look snap on VRM
- Ambient duck + soft presence bed + sparse proximity tones
- Warm light + fog when close / high warmth
- Screen vignette (consent-scaled)
- Occasional XR presence haptic

Proximity is the main continuous signal; trust/warmth/girlfriendAffection shape intensity.


## Spatial audio & micro-SFX

`src/systems/spatialAudio.ts`

- HRTF listener on camera
- Sources: `vivi_head`, `vivi_cloth`, `vivi_feet`, `player_feet`
- Procedural footsteps (wood/soft), cloth rustle on turn/proximity delta
- Spatial giggle on touch
- Close-range soft pulse when consent + high proximity
