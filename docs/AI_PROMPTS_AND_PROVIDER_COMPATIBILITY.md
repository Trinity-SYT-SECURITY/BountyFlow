# AI System Prompts & Provider Compatibility

This document analyzes the system prompts used across BountyFlow's AI features and assesses compatibility with Claude (Anthropic) and ChatGPT (OpenAI).

---

## Summary: Will Prompts Work with Claude and GPT?

**Yes.** All AI features now support multiple providers (Gemini, OpenAI, Anthropic). When Gemini API key is not configured, the system automatically falls back to OpenAI or Anthropic if those keys are set.

| Aspect | OpenAI (GPT) | Anthropic (Claude) | Status |
|--------|--------------|-------------------|--------|
| **Chat** | ✅ | ✅ | Multi-provider with fallback |
| **Recommendations** | ✅ | ✅ | Multi-provider |
| **Next Steps** | ✅ | ✅ | Multi-provider |
| **Scope Validation** | ✅ | ✅ | Multi-provider |
| **Knowledge Graph Analysis** | ✅ | ✅ | Multi-provider |
| **Report Generation** | ✅ | ✅ | Multi-provider |
| **Tool Recommendations** | ✅ | ✅ | Multi-provider |
| **KG Extraction** | ✅ | ✅ | Multi-provider |
| **Activity Analysis** (adapter) | ✅ | ✅ | Uses adapters |
| **Format Normalization** (adapter) | ✅ | ✅ | Uses adapters |

---

## 1. Prompt Locations & Structure

### 1.1 Chat Prompt (`ai_service.py` → `_build_chat_prompt`)

**Location:** `apps/backend/src/services/ai_service.py` lines 1393–1616

**Structure:**
```
[Security Instructions] + [System Role] + [Page Context] + [Project/Platform Context] + [User Question]
```

**Key elements:**
- **Security rules**: Relevance checking, prompt injection protection, data accuracy
- **Role**: "OFFENSIVE SECURITY EXPERT and ADVANCED PENETRATION TESTER"
- **Expertise**: Exploitation, web hacking, AD attacks, post-exploitation, etc.
- **Context**: Page-specific guidance + project data (targets, findings, users, tool outputs)
- **Output format**: Free-form text (no JSON)

**Provider usage:**
- **OpenAI** (`_call_openai`): `system: "You are an expert penetration testing assistant."` + `user: <full prompt>`
- **Anthropic** (`_call_anthropic`): `user: <full prompt>` only (no `system` parameter)
- **Gemini**: Single `contents=prompt`

**Compatibility:** ✅ Works with both. The full instructions are in the user message. Claude and GPT handle long prompts well.

**Improvement:** Use proper system/user split:
- **OpenAI**: Put security + role + expertise in `system`, context + question in `user`
- **Anthropic**: Use `system` parameter for instructions, `user` for context + question

---

### 1.2 Recommendation Prompt (`_build_recommendation_prompt`)

**Location:** `ai_service.py` lines 1157–1348

**Structure:** Long prompt with project context + JSON output format

**Output:** JSON array of recommendation objects with `title`, `description`, `category`, `commands`, `payloads`, etc.

**Provider:** Gemini only (`_generate_content`). **Not routed to OpenAI/Anthropic.**

**Compatibility:** ✅ Prompt format is generic. Would work with Claude/GPT if routed through adapters. JSON output requires:
- **OpenAI**: `response_format={"type": "json_object"}` 
- **Claude**: Rely on prompt instructions (no native JSON mode)

---

### 1.3 Analysis Prompt (`_build_analysis_prompt`)

**Location:** `ai_service.py` lines 1351–1391

**Structure:** Project context + findings + JSON output format

**Output:** JSON with `summary`, `attack_phase`, `mitre_techniques`, `recommendations`, etc.

**Provider:** Gemini only.

**Compatibility:** ✅ Same as recommendations.

---

### 1.4 Next Steps Prompt (`_build_next_steps_prompt`)

**Location:** `ai_service.py` lines 1619–1635

**Structure:** Short prompt, JSON array output

**Provider:** Gemini only.

**Compatibility:** ✅ Generic, would work with Claude/GPT.

---

### 1.5 Scope Validation Prompt (`_build_scope_validation_prompt`)

**Location:** `ai_service.py` lines 1637+

**Structure:** Scope context + target info + validation instructions

**Provider:** Gemini only.

**Compatibility:** ✅ Generic.

---

### 1.6 Knowledge Graph Analysis Prompt

**Location:** `ai_service.py` lines 586–653

**Structure:** Graph structure + project context + insights request

**Provider:** Gemini only.

**Compatibility:** ✅ Generic.

---

### 1.7 Report Generation Prompt (`report_service.py`)

**Location:** `apps/backend/src/services/report_service.py` lines 180–247

**Structure:** Project data + findings + tool executions + Markdown report instructions

**Provider:** Multi-provider (via unified adapter/async method).

**Compatibility:** ✅ Generic. Markdown output works with all providers.

---

### 1.8 KG Extraction Prompt (`kg_extraction_service.py`)

**Location:** `apps/backend/src/services/kg_extraction_service.py` lines 117–170

**Structure:** Tool output + JSON schema for entities/relations

**Output:** `{"entities": [...], "relations": [...]}`

**Provider:** Multi-provider (via unified adapter/async method).

**Compatibility:** ✅ Generic. JSON extraction works with all.

---

### 1.9 AI Model Adapter Prompts (`ai_model_adapter.py`)

**Used for:** Activity analysis, format normalization, entity extraction

**Providers:** Gemini, OpenAI, Anthropic (all have adapters)

**Structure:**
- **Analysis**: Tool/command/output → JSON with `summary`, `attack_phase`, `mitre_techniques`, `tags`, `confidence`
- **Normalization**: Raw data → `NormalizedData` JSON
- **Entity extraction**: Text → JSON array of entities

**OpenAI:** Uses `response_format={"type": "json_object"}` for analysis/normalization.

**Anthropic:** No JSON mode; relies on prompt instructions. Works but may need retry logic for malformed JSON.

**Compatibility:** ✅ All adapters implement the same prompts. OpenAI has better JSON reliability; Claude may occasionally need parsing fallbacks.

---

## 2. Implementation Gaps for Full Claude/GPT Support

### 2.1 Chat: System/User Message Split

**Current (OpenAI):**
```python
messages=[
    {"role": "system", "content": "You are an expert penetration testing assistant."},  # Too minimal!
    {"role": "user", "content": prompt}  # Full prompt here
]
```

**Current (Anthropic):**
```python
messages=[{"role": "user", "content": prompt}]  # No system parameter!
```

**Recommended:**
- **OpenAI**: Put `security_instructions` + `system_prompt` in `system`, `context_str` + user question in `user`
- **Anthropic**: Use `system=<instructions>` parameter, `user=<context + question>`

### 2.2 Output Parsing Resilience

For features that expect structured JSON back, relying solely on prompt instructions (as required currently for Claude/Anthropic) can occasionally lead to parsing errors if the AI adds conversational text before the JSON block.

To fully harden this:
1. Ensure the prompt enforces `Return strictly valid JSON without markdown wrapping`.
2. Implement fallback string paring (`re.search(r'\{.*\}|\{.*\]')`) or retry logic when parsing fails.

---

## 3. Prompt Format Compatibility

| Prompt Characteristic | Claude | GPT | Notes |
|-----------------------|--------|-----|-------|
| Long prompts (5k–15k tokens) | ✅ | ✅ | Both support 100k+ context |
| JSON output | ✅ | ✅ | GPT has `json_object` mode; Claude uses instructions |
| Markdown output | ✅ | ✅ | Both handle well |
| Security instructions | ✅ | ✅ | Both follow well |
| Role-playing (pentest expert) | ✅ | ✅ | Both handle well |
| Structured output (exact schema) | ⚠️ | ✅ | GPT Structured Outputs; Claude needs clear instructions |

---

## 4. Recommendations for Easy Claude/GPT Implementation

### 4.1 Low Effort (Chat Only)

1. **Anthropic**: Add `system` parameter to `_call_anthropic`:
   ```python
   response = await client.messages.create(
       model=model,
       max_tokens=2000,
       system=system_instructions,  # Extract from prompt
       messages=[{"role": "user", "content": user_message}]
   )
   ```

2. **OpenAI**: Expand system message with full instructions instead of one-liner.

### 4.2 Medium Effort (Multi-Provider for All Chat-Like Features)

1. Refactor `ai_service` to use `AIModelFactory` for recommendations, next steps, scope validation, KG analysis.
2. Add a generic `_call_provider(prompt, provider)` that routes to OpenAI/Anthropic/Gemini.
3. For JSON outputs: use `response_format` for OpenAI; for Claude, add "Return ONLY valid JSON" and robust parsing.

### 4.3 Higher Effort (Report + KG Extraction)

1. **report_service.py**: Replace `ai_service.model.generate_content` with provider-aware call.
2. **kg_extraction_service.py**: Add provider selection; use adapters for non-Gemini providers.

---

## 5. Conclusion

- **Chat**: Already works with Claude and GPT. Small improvements possible via system/user split.
- **Adapters** (activity analysis, normalization, entity extraction): Already multi-provider.
- **Other features** (recommendations, reports, KG extraction, etc.): Previously Gemini-only, but have now been successfully refactored to use `generate_content_async` for true multi-provider support.

The prompts themselves are **provider-agnostic** and will work seamlessly with Claude and GPT.
