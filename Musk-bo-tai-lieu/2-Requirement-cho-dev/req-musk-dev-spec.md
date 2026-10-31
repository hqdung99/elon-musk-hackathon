# Musk — Requirement cho dev (v1.0)

| | |
|---|---|
| Mục đích | Đặc tả để dev implement. Mỗi yêu cầu có ID, tiêu chí chấp nhận kiểm thử được, schema dữ liệu và API |
| Nguồn lý do (why) | `prd-musk-shopee.md` (v2.0). Tài liệu này **không** lặp lại lý do, chỉ nói **làm gì** và **đúng khi nào** |
| Tham chiếu giao diện | `musk-web-chat-src.html` (mockup). Mockup là **tham chiếu hành vi và bố cục**, không phải code để ship |
| Ngành minh họa | Điện thoại và đồ em bé chỉ xuất hiện trong ví dụ và fixture test. Lõi không chứa logic ngành |
| Trạng thái | Bản nháp để review với dev. Mục "Quyết định cần chốt" (mục 14) chặn một số story |

Quy ước:
- **P0** = bắt buộc cho MVP. **P1** = làm nếu kịp. **P2** = sau MVP.
- ID: `US-` story, `AC-` tiêu chí chấp nhận, `DM-` entity, `API-` endpoint, `ENG-` hàm engine, `UI-` component, `ERR-` mã lỗi, `EVT-` audit event, `CFG-` tham số cấu hình.
- Tiền: **số nguyên VND** (không float). Thời gian: ISO 8601 UTC, hiển thị theo giờ Việt Nam (UTC+7). ID: ULID.
- Ký hiệu AC: **Cho** (điều kiện đầu) / **Khi** (hành động) / **Thì** (kết quả kiểm chứng được).
- Mọi ngưỡng số là tham số `CFG-*` trong mục 3, **không hard-code**. Giá trị mặc định chưa kiểm chứng ghi (g) = giả định.

---

## 1. Phạm vi build

### 1.1 Trong MVP (P0)

1. Chat web: nhập yêu cầu → hỏi làm rõ → đề xuất → so sánh → duyệt → mở Shopee → checklist sau nhận.
2. Engine tất định: chuẩn hóa offer, lọc PASS/FAIL/UNKNOWN, giá cuối, tối ưu giỏ, chấm điểm, quyết định MUA/CHỜ/HỎI LẠI.
3. Category Pack nạp từ file cấu hình; chế độ chung L0 khi chưa có pack.
4. Voucher cá nhân qua ảnh chụp màn hình (đọc ảnh, xác nhận, tính lại, xóa ảnh).
5. Phiên bản quyết định, duyệt idempotent, audit log.
6. Nguồn dữ liệu: **snapshot** có provenance (live adapter là P1).

### 1.2 Ngoài MVP

Đặt hàng/thanh toán thay người mua, đăng nhập Shopee, đọc kho voucher tự động, dự đoán giá, khám phá sản phẩm khi chưa biết cần gì, theo dõi giá dài hạn, ứng dụng native, đa ngôn ngữ ngoài tiếng Việt (chuẩn bị i18n key nhưng chỉ ship `vi`).

### 1.3 Kiến trúc đề xuất (có thể đổi, cần dev xác nhận)

| Lớp | Công nghệ | Ghi chú |
|---|---|---|
| Frontend | Next.js + TypeScript + Tailwind | Chat UI, SSR không bắt buộc |
| Backend | FastAPI (Python 3.11) + Pydantic v2 | API, orchestration |
| Engine | Package Python thuần `musk_engine` | **Không import LLM/HTTP/DB**; chỉ hàm thuần |
| Lưu trữ | SQLite (MVP), schema dùng SQLAlchemy để đổi sang Postgres | |
| LLM | Adapter `LLMClient` (OpenAI hoặc tương đương) | Output **bắt buộc** qua Pydantic schema, có retry/timeout |
| Ảnh voucher | OCR + LLM vision sau interface `VoucherReader` | |
| Test | pytest, Playwright | |

Cấu trúc repo gợi ý:
```
/engine   musk_engine/ (normalize, constraints, pricing, optimizer, scoring, decide, explain, versioning)
/api      FastAPI app, routers, services, adapters (offers, llm, voucher_ocr)
/packs    *.yaml (Category Pack) + _schema.json
/web      Next.js app, components UI-*
/tests    unit (engine), contract (api), e2e (playwright), fixtures/
```

**Ràng buộc kiến trúc (kiểm bằng CI):**
- `musk_engine` không có dependency ngoài stdlib + pydantic; có test import-linter cấm import `openai`, `httpx`, `sqlalchemy`.
- Mọi hàm engine có chữ ký thuần: cùng input → cùng output byte-identical (xem AC-ENG-DET).

---

## 2. Danh sách Epic và Story

| Epic | Story | Ưu tiên |
|---|---|---|
| E1 Mission và hỏi làm rõ | US-101 Tạo mission từ câu chat · US-102 Chọn câu hỏi làm rõ · US-103 Trả lời câu hỏi và mặc định "Musk gợi ý" · US-104 Hồ sơ người mua | P0 |
| E2 Offer và chuẩn hóa | US-201 Nạp snapshot offer · US-202 Chuẩn hóa và ghép cùng sản phẩm · US-203 Đơn giá chuẩn hóa | P0 |
| E3 Điều kiện và bằng chứng | US-301 Constraint PASS/FAIL/UNKNOWN · US-302 Gợi ý nới điều kiện · US-303 Trust shop · US-304 Rating lọc seeding · US-305 Review 1–3★ theo chủ đề · US-306 Red flag · US-307 Độ tin của bằng chứng | P0 |
| E4 Giá | US-401 Giá cuối một đơn · US-402 Tối ưu giỏ nhiều món · US-403 Voucher cá nhân từ ảnh | P0 |
| E5 Quyết định | US-501 Chấm điểm và xếp hạng · US-502 Hai lựa chọn ngang nhau · US-503 Chính sách MUA/CHỜ/HỎI LẠI · US-504 Lời giải thích có nguồn | P0 |
| E6 Phiên bản và duyệt | US-601 Phiên bản quyết định và diff · US-602 Duyệt idempotent · US-603 Handoff mở Shopee · US-604 Audit log | P0 |
| E7 Giao diện chat | US-701 Khung chat và trạng thái bước · US-702 QuestionCard · US-703 ProposalCard · US-704 CompareCard · US-705 CartCard · US-706 Card HỎI LẠI (rủi ro, ngân sách, món chưa chốt, chọn 1 trong 2, dữ liệu cũ) · US-707 ApproveCard · US-708 PayCard và AfterCard · US-709 Responsive điện thoại · US-710 Trợ năng | P0 (US-709, US-710 P1) |
| E8 Category Pack | US-801 Nạp và validate pack · US-802 Chế độ chung L0 · US-803 Hết hạn pack | P0 |
| E9 Dữ liệu, riêng tư, vận hành | US-901 Provenance và readiness gate · US-902 Quyền riêng tư ảnh voucher · US-903 Logging, metric, feature flag | P0 (US-903 P1) |

---

## 3. Tham số cấu hình (CFG)

Lưu trong `config/engine.yaml`, nạp lúc khởi động, có version. Thay đổi tham số tạo `engine_config_hash` ghi vào mỗi Decision.

| Key | Mặc định | Dùng ở |
|---|---|---|
| `CFG-ASK-MAX-Q` | 3 | US-102 |
| `CFG-ASK-MAX-TURNS` | 2 | US-102 |
| `CFG-PACK-TTL-DAYS` | 90 (g) | US-803 |
| `CFG-BUDGET-TOL-APPROX` / `-MAX` | 0.03 (g) / 0 | US-301 |
| `CFG-SNAP-STALE-H` / `-WARN-H` | 72 / 24 | US-706, US-603 |
| `CFG-HIGH-VALUE-DEFAULT` | 5.000.000 (g) | US-503, L0 |
| `CFG-ASK-VARIANT-PRICE-GAP-PCT` | 10 (g) | US-202 |
| `CFG-UNKNOWN-ASK-GAP-PCT` | 1 (g) | US-301 |
| `CFG-RELAX-DAYS` / `-BUDGET-PCT` | [1,2] / [5,10] | US-302 |
| `CFG-SEED-WINDOW-H` | 48 | US-304 |
| `CFG-SEED-BURST-FACTOR` | 3 | US-304 |
| `CFG-SEED-SIM` / `-SIM-MIN-PEERS` | 0.9 / 3 | US-304 |
| `CFG-SEED-RATIO-HI` / `-LO` | 0.6 / 0.02 | US-304 |
| `CFG-SEED-5STAR-SHARE` / `-MID-SHARE` | 0.9 / 0.03 | US-304 |
| `CFG-SEED-MIN-REVIEWS` | 30 | US-304 |
| `CFG-REVIEW-SAMPLE-MAX` | 200 (g) | US-304, US-305 |
| `CFG-REVIEW-HALFLIFE-D` | 60 (g) | US-305 |
| `CFG-REVIEW-MEDIA-W` / `-SHORT-W` / `-SHORT-WORDS` | 2.0 / 0.3 / 5 | US-305 |
| `CFG-LOWSTAR-WINDOW-D` / `-NEW-SHARE` / `-NEW-D` | 90 / 0.5 / 30 | US-305 |
| `CFG-TRUST-TIER` | {mall:4, favorite:2.5, normal:1} | US-303 |
| `CFG-TRUST-PRIOR-RATING` / `-PRIOR-N` | 4.5 / 20 (g) | US-303 |
| `CFG-TRUST-PEN` | {age<6m:2, chat<80%:1, return_unknown:1} | US-303 |
| `CFG-RF-PRICE-LOW-RATIO` | 0.85 (g) | US-306 |
| `CFG-PRICE-SLOPE-DEFAULT` | 2.5 (g) (pack ghi đè) | US-501 |
| `CFG-PRESETS` | xem bảng 8.2 | US-501 |
| `CFG-TIE-GAP` | 0.5 (g) | US-502 |
| `CFG-SENS-PRICE-JITTER-PCT` / `-WEIGHT-DELTA` | 2 / 10 | US-502 |
| `CFG-OPT-ENUM-LIMIT` / `-KEEP-K` | 20000 / 4 | US-402 |
| `CFG-SAVING-MIN` | 10000 | US-402 |
| `CFG-ADDON-GAP-PCT` | 15 (g) | US-402 |
| `CFG-VOUCHER-SLOTS` | {shop:1, platform:1, freeship:1} | US-401 |
| `CFG-VOUCHER-RETENTION-D` | 30 (g) | US-902 |
| `CFG-VOUCHER-REPROMPT-DELTA` | 0.2 (g) | US-403 |
| `CFG-SALE-MINOR-FACTOR` | 0.5 (g) | US-503 |
| `CFG-SHIP` | {free_from:300000, fee:15000} (g) | US-401 |
| `CFG-UPLOAD` | {max_files:3, max_mb:5, mime:[jpeg,png,webp]} | US-403 |

---

## 4. Mô hình dữ liệu (DM)

Khóa chính ULID. Cột `created_at`, `updated_at` ở mọi bảng (không liệt kê lại). Mọi enum lưu dạng chuỗi.

### DM-01 `profile`
| Field | Kiểu | Ràng buộc |
|---|---|---|
| id | ulid | PK |
| owner_ref | string | định danh phiên/người dùng |
| attrs | json | cặp khóa-giá trị theo pack (ví dụ `{"age_months":14,"weight_kg":11}`), mỗi giá trị có `source: user_said|profile` |
| rules | json[] | `{type, params}`; type ∈ `shop_tier_in`, `shop_age_min_months`, `freshness_min_months`, `brand_only` |
| budget_monthly | int null | VND |
| stock | json null | tồn kho theo `item_key`, tùy chọn |

### DM-02 `mission`
| Field | Kiểu | Ghi chú |
|---|---|---|
| id | ulid | PK |
| profile_id | ulid null | FK |
| status | enum | `CLARIFYING, READY, EVALUATED, APPROVED, HANDED_OFF, CLOSED` |
| raw_text | text | câu chat gốc |
| items | json[] | `MissionItem` (DM-03) |
| preferences | json | `{preset, weights{price,trust,assurance,speed}, source}` |
| budget | json | `{scope: item|cart, amount:int, tol:"max"|"approx"}` |
| current_version | int | 0 khi chưa có decision |

### DM-03 `MissionItem` (nhúng trong mission.items)
`{item_key, text, category_id, pack_id, quantity:int, spec:{attr:{value,source:user_said|profile|default|inferred}}, constraints[], status}`.
`constraints[]` = `{type, params, hardness: hard|soft, source}` theo catalog 7.2.

### DM-04 `pack` (Category Pack, lưu bản nạp)
`{category_id, version, readiness: L1|L2, valid_as_of: date, content: json (schema 9.1), hash}`

### DM-05 `snapshot`
`{id, source, mode: live|snapshot, observed_at, query, offer_count, hash}`

### DM-06 `shop`
`{id, snapshot_id, name, tier: mall|favorite|normal, rating: number null, rating_count: int null, sold: int null, age_months: int null, chat_rate: number null, chat_time_text: string null, return_policy_days: int null, location: string null}`. Giá trị thiếu là `null`, **không** mặc định 0.

### DM-07 `offer`
| Field | Kiểu | Ghi chú |
|---|---|---|
| id | ulid | |
| snapshot_id, shop_id | ulid | FK |
| source_url | string | bắt buộc |
| observed_at | datetime | bắt buộc |
| title_raw | string | |
| images | string[] | |
| variant_label | string null | biến thể đang xét |
| price_list | int | VND |
| stock | int null | |
| shipping | json | `{days_min:int|null, days_max:int|null, fee:int|null, from_location}` |
| vouchers_visible | json[] | `Voucher` (DM-09) |
| return_policy | json null | |
| attrs | json | `{field: Value}`; `Value={v, status: verified|claimed_by_shop|inferred|unknown, evidence_ids[]}` |
| identity | json | khóa định danh đã chuẩn hóa hoặc `null` nếu không parse được |

### DM-08 `evidence`
`{id, offer_id|shop_id, type: listing_field|title|description|review|buyer_photo|shop_page|user_upload|official_lookup, source_url, observed_at, excerpt, confidence: 0..1}`

### DM-09 `Voucher` (dùng chung công khai và cá nhân)
`{code, slot: shop|platform|freeship, kind: amount|percent, value:int, cap:int|null, min_spend:int|null, scope:{shop_ids?:[], categories?:[]}|null, expires_at: date|null, origin: public|personal, confidence: ok|unsure}`

### DM-10 `review`
`{id, offer_id, shop_id, rating:1..5, text, posted_at, has_media: bool, reviewer_masked: string, reply_text: string|null, variant_label}`

### DM-11 `decision` (bất biến sau khi tạo)
`{id, mission_id, version:int, parent_version:int|null, snapshot_id, inputs_hash, config_hash, outcome (xem 6.3), payload (xem 6.3), price_snapshot_hash, created_at}`
Ràng buộc: `UNIQUE(mission_id, version)`; không có UPDATE/DELETE trên bảng này (enforce bằng trigger hoặc repository chỉ có `insert`).

### DM-12 `approval`
`{id, decision_id, mission_id, decision_version, price_snapshot_hash, status: ACTIVE|VOID, idempotency_key, created_at}`; `UNIQUE(mission_id, decision_version)`; khi có decision mới → mọi approval cũ của mission chuyển `VOID`.

### DM-13 `handoff`
`{id, approval_id, orders:[{order_index, shop_id, items[], total:int, deeplink, vouchers_to_pick[], status: NOT_PLACED|PLACED}], created_at}`

### DM-14 `voucher_personal`
`{id, mission_id, items: Voucher[], source_image_deleted_at: datetime, expires_at, deleted_at}`

### DM-15 `audit_event`
`{id, ts, type (EVT-*), mission_id, entity, entity_id, actor: user|system|llm, payload json, request_id}`; append-only.

### DM-16 `chat_message`
`{id, mission_id, role: user|musk, kind: text|card, card_type: UI-*, card_ref (decision_id|question_set_id…), payload json, superseded: bool}`

---

## 5. API (API)

Quy ước chung: JSON UTF-8; lỗi trả `{error:{code, message_vi, details}}`; mọi POST thay đổi trạng thái nhận header `Idempotency-Key`; `X-Request-Id` đi kèm và ghi vào audit. Tất cả có `mission_id` thuộc phiên hiện tại (403 `ERR-FORBIDDEN` nếu không).

| ID | Endpoint | Việc | Thành công | Lỗi |
|---|---|---|---|---|
| API-01 | `POST /missions` | Tạo mission từ `{text, profile_id?}`; gọi `ENG-01` | 201 `{mission, next: {type:"questions"|"evaluate", ...}}` | 400 `ERR-VALIDATION`; 422 `ERR-PARSE-FAILED` (trả câu hỏi mở thay vì lỗi cứng) |
| API-02 | `POST /missions/{id}/answers` | Gửi trả lời `{question_set_id, answers[{key,value|"auto"}]}` | 200 `{mission, next}` | 409 `ERR-QUESTION-STALE` |
| API-03 | `PATCH /missions/{id}/preferences` | Đổi ưu tiên/ràng buộc/hồ sơ `{op, ...}` | 200 `{mission}`; **không** tự tạo decision | 400 |
| API-04 | `POST /missions/{id}/offers/refresh` | Tải lại offer vào snapshot mới | 202 `{snapshot_id}` | 503 `ERR-SOURCE-UNAVAILABLE` |
| API-05 | `POST /missions/{id}/evaluate` | Tạo decision version mới (`ENG-*`) | 201 `{decision, diff?}` | 422 `ERR-INSUFFICIENT-EVIDENCE` (kèm gợi ý nới) |
| API-06 | `GET /missions/{id}/decisions/latest` | Lấy decision mới nhất | 200 | 404 |
| API-07 | `GET /missions/{id}/decisions/{version}` | Lấy decision theo version | 200 | 404 |
| API-08 | `POST /missions/{id}/vouchers` | Tải 1–3 ảnh (multipart); trả danh sách mã đọc được để xác nhận | 200 `{voucher_draft_id, items[Voucher]}` | 413 `ERR-UPLOAD-TOO-LARGE`, 415 `ERR-UPLOAD-TYPE`, 422 `ERR-VOUCHER-UNREADABLE` |
| API-09 | `POST /missions/{id}/vouchers/{draft_id}/confirm` | Người mua xác nhận/sửa mã `{items[...]}`; tạo decision mới | 201 `{decision, diff}` | 409 |
| API-10 | `DELETE /missions/{id}/vouchers` | Xóa voucher đã lưu; tạo decision mới | 200 `{decision, diff}` | — |
| API-11 | `POST /decisions/{id}/approve` | Duyệt phiên bản (idempotent); body `{decision_version, price_snapshot_hash}` | 201 `{approval, handoff}` | 409 `ERR-VERSION-MISMATCH` (kèm diff), 409 `ERR-SNAPSHOT-CHANGED`, 422 `ERR-NOT-APPROVABLE` |
| API-12 | `POST /handoffs/{id}/orders/{index}/placed` | Đánh dấu đơn đã đặt | 200 | 409 nếu approval VOID |
| API-13 | `POST /missions/{id}/reminders` | Tạo nhắc `{kind: "before_event", event_id}` | 201 | — |
| API-14 | `GET /missions/{id}/audit` | Xem nhật ký | 200 (phân trang) | — |
| API-15 | `GET /packs/{category_id}` | Xem pack (nội bộ) | 200 | 404 |
| API-16 | `POST /packs/validate` | Validate pack mới theo schema 9.1 | 200 `{valid, errors[]}` | — |

### Bảng mã lỗi (ERR)

| Mã | HTTP | Khi nào | `message_vi` (mẫu) |
|---|---|---|---|
| `ERR-VALIDATION` | 400 | Sai kiểu, thiếu trường, giá trị ngoài danh sách | "Dữ liệu chưa hợp lệ, bạn kiểm tra lại giúp." |
| `ERR-FORBIDDEN` | 403 | `mission_id` không thuộc phiên | "Bạn không có quyền với yêu cầu này." |
| `ERR-QUESTION-STALE` | 409 | Trả lời cho bộ câu hỏi đã bị thay thế | "Câu hỏi đã được cập nhật, bạn xem lại giúp." |
| `ERR-VERSION-MISMATCH` | 409 | Duyệt phiên bản không còn là hiện tại (kèm `diff`) | "Giỏ vừa thay đổi, xem lại trước khi duyệt." |
| `ERR-SNAPSHOT-CHANGED` | 409 | `price_snapshot_hash` không khớp | "Giá vừa được cập nhật, xem lại trước khi duyệt." |
| `ERR-UPLOAD-TOO-LARGE` | 413 | Ảnh vượt `CFG-UPLOAD.max_mb` | "Ảnh quá lớn, bạn chọn ảnh nhỏ hơn 5 MB." |
| `ERR-UPLOAD-TYPE` | 415 | MIME ngoài danh sách | "Musk chỉ đọc ảnh JPEG, PNG hoặc WebP." |
| `ERR-PARSE-FAILED` | 422 | LLM không trả đúng schema sau retry | "Musk chưa hiểu rõ yêu cầu, bạn nói rõ hơn được không?" |
| `ERR-VOUCHER-UNREADABLE` | 422 | Không đọc được mã nào từ ảnh | "Musk chưa đọc được mã nào, bạn thử chụp rõ hơn." |
| `ERR-NOT-APPROVABLE` | 422 | `outcome.kind=ASK` | "Chưa thể duyệt, Musk cần bạn trả lời một câu trước." |
| `ERR-INSUFFICIENT-EVIDENCE` | 422 | Không đủ dữ liệu để quyết định (kèm gợi ý nới nếu có) | "Musk chưa đủ dữ liệu để chọn giúp bạn." |
| `ERR-SOURCE-UNAVAILABLE` | 503 | Nguồn offer không truy cập được | "Chưa lấy được giá mới, Musk đang dùng dữ liệu đã lưu." |

### API-01 ví dụ

Request:
```json
{ "text": "Mua một món abc, tầm 19 triệu", "profile_id": null }
```
Response 201:
```json
{
  "mission": { "id": "01J...", "status": "CLARIFYING", "items": [ { "item_key": "i1", "category_id": "<pack>|generic", "spec": {} } ],
               "budget": { "scope": "item", "amount": 19000000, "tol": "approx" } },
  "next": { "type": "questions", "question_set_id": "01J...", "turn": 1,
            "questions": [ { "key": "attr_a", "label_vi": "…", "kind": "single|multi", "options": [ { "value": "x", "label_vi": "…", "hint_vi": "…", "suggested": true } ], "allow_auto": true } ] }
}
```

### API-05 response (Decision)

```json
{
  "decision": {
    "id": "01J...", "mission_id": "01J...", "version": 2, "parent_version": 1,
    "snapshot_id": "01J...", "inputs_hash": "sha256:...", "config_hash": "sha256:...", "price_snapshot_hash": "sha256:...",
    "outcome": { "kind": "BUY|WAIT|ASK", "ask_type": null },
    "cart": {
      "lines": [ { "item_key":"i1", "offer_id":"01J...", "shop_id":"01J...", "qty":1, "line_price":17840000, "unit_price":{"value":17840000,"unit":"đ/máy"}, "reason_slots":{} } ],
      "orders": [ { "shop_id":"01J...", "subtotal":18190000, "voucher_shop":150000, "voucher_platform":200000, "voucher_personal":0, "ship":0, "net":17840000, "breakdown_id":"01J..." } ],
      "total": 17840000, "saving": 0,
      "budget": { "scope":"item", "amount":19000000, "used":17840000, "within": true }
    },
    "ranked": [ { "offer_id":"...", "U":9.20, "sub":{"price":10,"trust":9.35,"assurance":10,"speed":4}, "status":"PASS", "evidence_confidence":"medium" } ],
    "excluded": [ { "offer_id":"...", "status":"FAIL|UNKNOWN|NORM", "reason_code":"ASSURANCE_NOT_MET", "reason_vi":"…", "red_flags":["RF_..."] } ],
    "explanation": { "headline":"…", "reasons":[ {"text":"…","evidence_ids":["…"]} ], "tradeoff":{"text":"…","evidence_ids":[]}, "uncertain":[ {"field":"…","text":"…"} ] },
    "flip_conditions": [ { "scenario":"preset:speed", "new_winner_offer_id":"…" } ],
    "timing": { "show": false, "event_id": null, "days": null, "text_vi": null },
    "banners": [ { "type":"STALE_SNAPSHOT", "observed_at":"…" } ],
    "created_at": "…"
  },
  "diff": { "lines_vi": ["Đổi từ A sang B vì …"] }
}
```

---

## 6. Engine (ENG)

Tất cả hàm trong `musk_engine`, thuần, nhận dataclass/Pydantic đã validate, không I/O. Số tiền `int`. Sắp xếp luôn ổn định với khóa phụ `offer_id`.

### 6.1 Danh sách hàm

| ID | Hàm | Input → Output |
|---|---|---|
| ENG-01 | `parse_mission(text, profile, pack_registry)` | **Gọi LLM** qua adapter bên ngoài; engine chỉ có `validate_mission(raw_json)` kiểm schema và gắn `source` cho từng giá trị |
| ENG-02 | `select_questions(mission, pack, candidates, profile, turn)` | → `Question[]` (≤ `CFG-ASK-MAX-Q`) |
| ENG-03 | `normalize(offer_raw, pack)` | → `Offer` có `identity`, `attrs` |
| ENG-04 | `match(offers, mission_item, pack)` | → `{matched[], rejected_norm[{offer, reason}], ask_variants[]}` |
| ENG-05 | `evaluate_constraints(offer, item_constraints, ctx)` | → `{status: PASS|FAIL|UNKNOWN, checks[{type,status,reason_code,evidence_ids}]}` |
| ENG-06 | `suggest_relaxation(item, offers, constraints)` | → `Relaxation[≤2]` |
| ENG-07 | `trust_score(shop, red_flags, cfg)` | → 0..10 |
| ENG-08 | `seeding_filter(reviews, shop, cfg)` | → `{rating_raw, rating_filtered|null, removed_count, signals[], reason_if_null}` |
| ENG-09 | `group_low_star(reviews, pack, cfg)` | → `Group[{topic, type, count, share, quote_review_id, photo_ids[≤3], is_new}]` |
| ENG-10 | `red_flags(offer, shop, reviews, pack)` | → `RedFlag[]` |
| ENG-11 | `evidence_confidence(offer, shop, reviews, snapshot)` | → `high|medium|low` |
| ENG-12 | `price_order(lines, vouchers, cfg)` | → `OrderPrice` có `breakdown` |
| ENG-13 | `optimize_cart(items_pass_offers, vouchers, budget, cfg)` | → `{best, greedy, saving, ranked_alternatives}` |
| ENG-14 | `score(offers, weights, pack, cfg)` | → `RankedOffer[]` |
| ENG-15 | `sensitivity(ranked, scenarios, cfg)` | → `flip_conditions[]`, `is_tie` |
| ENG-16 | `timing_advice(winner, mission, pack, calendar, price_history|None, cfg)` | → `TimingAdvice` |
| ENG-17 | `decide(state)` | → `Outcome` theo bảng 6.2 |
| ENG-18 | `explain(decision_state, templates)` | → `Explanation`; mọi số lấy từ slot |
| ENG-19 | `validate_claims(explanation, evidence_index)` | → bỏ claim không có evidence |
| ENG-20 | `diff(prev_decision, next_decision, cause)` | → `lines_vi[≤2]` |
| ENG-21 | `inputs_hash(...)`, `price_snapshot_hash(...)` | → sha256 trên JSON chuẩn hóa (key sắp xếp, không khoảng trắng) |
| ENG-22 | `weights_from_text(text)` | → `Preset` hoặc `HardConstraint` (rule-based; LLM fallback ở adapter) |

### 6.2 ENG-17 `decide`: bảng quyết định (thứ tự đánh giá, dừng ở luật đầu tiên đúng)

| # | Điều kiện | Kết quả |
|---|---|---|
| 1 | Không có offer PASS và có UNKNOWN thỏa điều kiện hỏi (US-301/AC-301-7) | `ASK` loại `CONFIRM_RISK` |
| 2 | Không có offer PASS (còn lại) | `ASK` loại `RELAX` (kèm `ENG-06`); nếu `ENG-06` rỗng và thiếu dữ liệu → lỗi `ERR-INSUFFICIENT-EVIDENCE` |
| 3 | Winner (hoặc giỏ) vượt ngân sách ngoài tol / giỏ vượt ngân sách tháng | `ASK` loại `OVER_BUDGET` |
| 4 | `is_tie` (ENG-15) | `ASK` loại `PICK_ONE_OF_TWO` |
| 5 | Một món trong giỏ chưa chốt (không PASS, có UNKNOWN hoặc FAIL theo hồ sơ) | `ASK` loại `ITEM_UNRESOLVED` (kèm `item_key`), các món khác vẫn có trong giỏ |
| 6 | `evidence_confidence(winner)=low` và `winner.final > pack.high_value_threshold` (hoặc ngành L0 và `> CFG-HIGH-VALUE-DEFAULT`) | `ASK` loại `CONFIRM_STALE_OR_LOW_EVIDENCE` |
| 7 | `timing_advice.wait=true` | `WAIT` |
| 8 | còn lại | `BUY` |

### 6.3 Cấu trúc `outcome`

`{kind: BUY|WAIT|ASK, ask_type: CONFIRM_RISK|RELAX|OVER_BUDGET|PICK_ONE_OF_TWO|ITEM_UNRESOLVED|CONFIRM_STALE_OR_LOW_EVIDENCE|null, item_key?: string}`.
Quy tắc: nút Duyệt chỉ khả dụng khi `kind=BUY` (hoặc `kind=WAIT` với hành động "Mua luôn"). API-11 trả `ERR-NOT-APPROVABLE` nếu vi phạm.

### 6.4 ENG-12 `price_order`: thuật toán

```
input: lines[{offer_id, unit_price, qty}], shop_vouchers[], platform_vouchers[], freeship_vouchers[], personal_vouchers[], cfg
subtotal = Σ unit_price × qty
# slot shop (tối đa CFG-VOUCHER-SLOTS.shop): chọn voucher có giảm lớn nhất thỏa min_spend, trong tập public + personal(slot=shop)
disc_shop = max over v of discount(v, subtotal) với điều kiện subtotal >= v.min_spend
after_shop = subtotal - disc_shop
# slot platform: base min_spend tính theo PARAM `platform_min_spend_base ∈ {list, after_shop}` (cấu hình, mặc định list)
disc_platform = max over v of discount(v, base)
after_platform = after_shop - disc_platform
ship_base = (subtotal >= CFG-SHIP.free_from) ? 0 : CFG-SHIP.fee    # nếu có dữ liệu ship thật thì dùng
disc_freeship = max over v of min(ship_base, v.value) nếu đủ điều kiện
net = after_platform + ship_base - disc_freeship
discount(v, base) = v.kind==amount ? v.value : min(round_down(base × v.value/100), v.cap or ∞)
```
- Voucher cá nhân dùng chung thuật toán chọn slot; không tạo slot mới.
- Voucher thiếu một trong các trường {mức giảm, cap (nếu percent), min_spend, scope} → `confidence=unsure` → **không trừ**, thêm `pending_question`.
- Không trừ: xu, khuyến mãi thanh toán. Chỉ ghi chú.
- Output `breakdown` lưu đủ từng bước (audit); UI chỉ lấy `net` và dòng "đã gồm …".

### 6.5 ENG-13 `optimize_cart`

```
Cho mỗi item i: P_i = offers PASS (đã cắt tỉa).
if Π|P_i| <= CFG-OPT-ENUM-LIMIT: duyệt toàn bộ tổ hợp
else:
  1) prune theo dominance: bỏ X nếu tồn tại Y cùng shop hoặc shop đã có trong giỏ với price(Y) <= price(X) và trust(Y) >= trust(X)
  2) giữ <= CFG-OPT-KEEP-K offer/món: 2 rẻ nhất + offer rẻ nhất tại mỗi shop có voucher đơn
  3) nếu còn vượt: duyệt theo tập shop S (|S|<=3), gán món vào shop rẻ nhất trong S
cho mỗi tổ hợp: nhóm theo shop → price_order cho từng shop → total
best = argmin(total) với tie-break theo thứ tự: |total_a-total_b|<=1000 → ít shop hơn → trust TB cao hơn → ETA max nhỏ hơn → offer_id
greedy = tổ hợp chọn offer rẻ nhất cho từng món (cùng tập PASS, cùng price_order)
saving = max(0, total(greedy) - total(best)); chỉ hiển thị nếu >= CFG-SAVING-MIN
ràng buộc ngân sách tháng: total(best) > budget → trả `over_budget` và `alt` = best với (qty-1) cho món có thể bớt
```
Hiệu năng: 6 món × 8 offer (262.144 tổ hợp) < 500 ms.

### 6.6 ENG-14 `score`: công thức

```
price_score = clamp(10 - s * Δ%, 0, 10),  Δ% = (p - p_min) / p_min * 100,  s = pack.price_slope ?? CFG-PRICE-SLOPE-DEFAULT;  chỉ một offer → 10
trust_score = ENG-07
assurance_score = theo pack.assurance_rules: verified=10, claimed=6, seller_only=min(5, months/2), unknown=0
speed_score = max(0, 10 - (days_max - 1) * 2);  days_max null → 0 và offer không được chọn winner nếu mission có hạn giao
freshness_score = min(10, months_left - 2) (chỉ khi pack bật)
U = Σ(w_k * s_k) / Σ w_k ; làm tròn 0.01 trước khi so sánh
sắp xếp: U giảm → final_price tăng → trust giảm → days_max tăng → offer_id tăng
giỏ nhiều món (cost-first): mục tiêu chính là total nhỏ nhất (ENG-13); trust chỉ là tie-break
```

### 6.7 ENG-07 trust

```
rating_adj = (rating * n + CFG-TRUST-PRIOR-RATING * CFG-TRUST-PRIOR-N) / (n + CFG-TRUST-PRIOR-N)
trust = clamp( tier_pts + max(0, rating_adj - 4) * 4 + min(2, log10(max(1,n)) / 2)
               - pen_age(age_months < 6) - pen_chat(chat_rate < 0.8) - pen_return(return_policy null)
               - Σ pen(red_flag: minor 0.5, medium 1.5), 0, 10)
red_flag major → offer bị loại, không chấm
trường null → bỏ qua penalty tương ứng và dùng công thức trust_v1 cho phần rating
```

### 6.8 ENG-16 `timing_advice`

```
wait = ALL:
  (a) mission không gấp: need_by >= event_date + days_max(winner)   [hàng tiêu hao: days_of_stock >= days_to_event]
  (b) expected_saving = expected_pct(pack, event) * final(winner) >= max(pack.min_abs_saving, 0.02 * final)
  (c) price_history có >= 2 đợt sale trước
  (d) days_to_event <= pack.wait_window_days
expected_pct = pack.sale_expectation[event.size] ; event.size=minor → * CFG-SALE-MINOR-FACTOR
nếu price_history is None → wait = false (c không thỏa)
show_note = (days_to_event <= pack.wait_window_days) AND NOT mission.urgent AND NOT (consumable AND days_of_stock < 5)
text_vi: lấy từ template TXT-TIMING-1 (có lịch sử) hoặc TXT-TIMING-0 (không có lịch sử). Cấm các cụm trong danh sách 11.3
```

### 6.9 ENG-08 `seeding_filter`

```
if reviews_in_sample < CFG-SEED-MIN-REVIEWS → rating_filtered = null, reason_if_null = "TOO_FEW_REVIEWS"
signals (mỗi review có thể dính nhiều tín hiệu; loại nếu dính >= 1 tín hiệu mạnh):
  S1 burst: số review 5★ có len <= 10 ký tự trong cửa sổ CFG-SEED-WINDOW-H > CFG-SEED-BURST-FACTOR × trung bình các cửa sổ cùng độ dài → đánh dấu các review trong cửa sổ
  S2 duplicate: similarity(text_i, text_j) >= CFG-SEED-SIM với >= CFG-SEED-SIM-MIN-PEERS review khác → đánh dấu
  S3 gift_keywords: text chứa từ khóa (tặng, quà, xu, "đánh giá 5 sao", hoàn tiền) → đánh dấu
  S4 reviewer_new: tài khoản chỉ có 1 review, không ảnh (chỉ khi có dữ liệu)
  S5 shop-level: review_count/sold > CFG-SEED-RATIO-HI hoặc < CFG-SEED-RATIO-LO → cờ shop (không loại từng review)
  S6 distribution: 5★ share > CFG-SEED-5STAR-SHARE và 2–4★ share < CFG-SEED-MID-SHARE → cờ shop
  S7 off_topic: chỉ khen giao hàng/đóng gói → hạ trọng số, không loại
rating_filtered = trung bình sao của review không bị loại
output: removed_count, signals_table[{signal,count}], sample_removed[≤3] (đã che tên)
```
Ngôn ngữ UI: dùng "nghi seeding", không dùng "giả".

---

## 7. Catalog constraint và luật chuẩn hóa

### 7.1 Chuẩn hóa

| Bước | Quy tắc |
|---|---|
| 1 | Đọc trường cấu trúc (biến thể đã chọn, thuộc tính listing) |
| 2 | Regex `pack.parsers[attr]` trên `title_raw`, `description` |
| 3 | Nếu bước 2 không ra và thuộc tính ∈ `identity_keys` → gọi LLM extraction (schema cố định) |
| 4 | Đối chiếu ảnh (P1) |
| Xung đột 1 vs 2/3 | Giữ giá trị bước 1, gắn `RF_TITLE_CONFLICT` (nhẹ) |
| `identity` không parse được | `offer.identity = null` → loại với `reason_code=NORM_UNKNOWN`, **không hiện**, ghi audit |
| Biến thể trong listing | Tách thành nhiều `offer` ảo (mỗi biến thể một giá) |

Ghép (ENG-04):

| Tình huống | Hành động | `reason_code` |
|---|---|---|
| Khóa định danh khớp, biến thể khớp | vào `matched` | — |
| Khóa định danh khác | `rejected_norm`, hiển thị trong "bị loại" | `NORM_IDENTITY_MISMATCH` |
| Biến thể khác nhưng có thể chấp nhận, người mua chưa nói, thuộc tính quan trọng, chênh giá ≥ `CFG-ASK-VARIANT-PRICE-GAP-PCT` | thêm `ask_variants[]` (hỏi 1 lần) | `ASK_VARIANT` |
| Biến thể khác, người mua đã nói rõ | loại | `NORM_VARIANT_MISMATCH` |
| Quy cách khác | ghép, quy đổi số lượng gần nhất ≥ nhu cầu, so theo đơn giá | — |

### 7.2 Catalog constraint

| `type` | hardness | `params` | PASS | FAIL | UNKNOWN |
|---|---|---|---|---|---|
| `identity` | hard | `{keys}` | khớp | khác | parse không ra → NORM_UNKNOWN |
| `variant` | hard | `{attr,value}` | khớp và `stock>0` | khác hoặc hết hàng | `stock=null` và attr mandatory |
| `condition` | hard nếu người mua nói | `{allowed:[...]}` | thuộc allowed, không RF nặng | ngoài allowed | giá trị chỉ `claimed` và có RF trung bình |
| `budget_item` | hard | `{amount,tol}` | `final <= amount*(1+tol)` | vượt | giá null |
| `budget_cart_month` | hard (mức giỏ) | `{amount}` | `total <= amount` | vượt → ASK OVER_BUDGET | — |
| `assurance` | hard nếu người mua yêu cầu, else soft | `{level}` | `Value.status=verified` ≥ level | đạt level thấp hơn | `claimed_by_shop` hoặc null |
| `delivery_deadline` | hard nếu người mua nói hạn | `{days}` | `days_max <= days` | `days_min > days` hoặc (`days_min <= days < days_max`) | ETA null |
| `shop_tier_in` | hard (rule profile) | `{tiers}` | tier ∈ | khác | — |
| `shop_age_min` | hard (rule profile) | `{months}` | `age >= months` | `<` | null |
| `freshness_min` | hard nếu pack bật | `{months}` | `months_left >= m` (verified, hoặc claimed có ảnh) | `<` | không ghi |
| `fit_by_profile` | hard | `{attr, table}` | khớp bảng theo profile | khác | profile thiếu → hỏi |
| `brand_pref` | soft; hard nếu profile `brand_only` | `{brand}` | — | — | — |

Quy tắc gộp: `FAIL` nếu bất kỳ hard=FAIL; `UNKNOWN` nếu không FAIL và có hard=UNKNOWN; `PASS` còn lại. `claimed_by_shop` cho constraint đòi xác minh → UNKNOWN; cho constraint không đòi xác minh (ETA, số lượng) → PASS. `inferred` coi như `claimed_by_shop`.

Nâng claimed → verified (`pack.assurance_rules.verify`): một trong các điều kiện khai báo trong pack, ví dụ `{any_of:[{shop_tier:"mall", brand_match:true},{photo_reviews_confirm:{min:2,within_days:60}}]}`. Ngành L0: không nâng.

### 7.3 Red flag

Khung: `{code, scope: offer|shop, level: minor|medium|major, when(expr), effect: exclude|penalty|unknown|note}`. Bộ chung (engine) và bộ riêng (pack) cùng nạp. Bộ chung: `RF_NEW_SHOP_SPIKE`, `RF_PRICE_TOO_LOW (final < CFG-RF-PRICE-LOW-RATIO × trung vị PASS cùng identity)`, `RF_NOT_AS_DESCRIBED`, `RF_QUALITY_REPEAT`, `RF_OFF_PLATFORM`, `RF_TITLE_CONFLICT`, `RF_FAKE_REVIEWS`, `RF_NO_ASSURANCE_INFO`. `when` là biểu thức trên dữ liệu đã chuẩn hóa, đánh giá bằng interpreter an toàn (không `eval`).

### 7.4 Gợi ý nới (ENG-06)

Thử lần lượt: hạn giao `+d ∈ CFG-RELAX-DAYS`; ngân sách `+p% ∈ CFG-RELAX-BUDGET-PCT`; bỏ ưu tiên mềm; hạ `assurance` xuống "shop tự nói"; quy tắc profile (chỉ đề xuất). **Không bao giờ** nới `identity` hoặc ngưỡng an toàn của pack (`pack.never_relax[]`) và shop có RF major. Trả tối đa 2 phương án có ≥ 1 offer PASS mới, kèm `{relaxed, winner_offer_id, final}`. Không tự áp.

---

## 8. Đặc tả story

Mỗi story: **Mô tả** → **Yêu cầu** → **AC** → **Lỗi/biên** → **Audit** → **Test**. Hàm/entity/API tham chiếu bằng ID.

### E1. Mission và hỏi làm rõ

#### US-101 Tạo mission từ câu chat · P0
**Mô tả:** Là người mua, tôi gõ nhu cầu bằng tiếng Việt (hoặc Anh) để Musk hiểu tôi muốn mua gì.
**Yêu cầu:**
- API-01 gọi `parse_mission` (LLM, output schema `MissionDraft`). Engine `validate_mission` gán `source=user_said` cho giá trị lấy từ câu, `inferred` cho giá trị suy ra.
- Nhận diện ngành bằng `pack.match`; nhiều món → nhiều `MissionItem`. Không khớp pack → `category_id="generic"` (US-802).
- Trích `budget` với `tol`: "tối đa" → `max`; "khoảng/~/tầm" → `approx`.
- **Không** điền giá trị chưa rõ: để `null` và đưa vào danh sách cần hỏi.
**AC:**
- AC-101-1: **Cho** câu có đủ thuộc tính mandatory, **Khi** POST /missions, **Thì** `status=READY` và `next.type="evaluate"`.
- AC-101-2: **Cho** câu thiếu thuộc tính mandatory, **Khi** POST /missions, **Thì** `status=CLARIFYING` và `next.type="questions"`.
- AC-101-3: **Cho** LLM trả JSON sai schema, **Khi** retry 1 lần vẫn sai, **Thì** trả 422 `ERR-PARSE-FAILED`, UI hiện câu hỏi mở "Bạn muốn mua gì?", không crash.
- AC-101-4: **Cho** mọi giá trị trong `mission.items[].spec`, **Thì** có `source` hợp lệ; giá trị `inferred` hiển thị là "Musk giả định" ở UI.
- AC-101-5: **Cho** câu nhắc nhiều món ("A, B, C"), **Thì** tạo đúng số `MissionItem`, mỗi món có `item_key` ổn định.
- AC-101-6: **Cho** "tối đa 19 triệu" và "tầm 19 triệu", **Thì** `tol` lần lượt là `max` và `approx`.
**Lỗi/biên:** LLM timeout 10s → retry 1 lần → `ERR-PARSE-FAILED`. Đầu vào rỗng/quá dài (> 2.000 ký tự) → 400 `ERR-VALIDATION`.
**Audit:** `EVT-MISSION-CREATED`, `EVT-LLM-CALL` (kèm prompt hash, không lưu dữ liệu cá nhân thừa).
**Test:** unit validate_mission (8 mẫu); contract API-01; mock LLM trả sai schema.

#### US-102 Chọn câu hỏi làm rõ · P0
**Mô tả:** Là người mua, tôi chỉ bị hỏi những điều thực sự ảnh hưởng kết quả.
**Yêu cầu:** `ENG-02`:
1. Lấy thuộc tính `mandatory` chưa có giá trị, sắp theo `priority`.
2. Thêm thuộc tính `conditional` có `ask_if` đúng trên tập ứng viên hiện tại (`ask_if` là biểu thức trên tập offer, ví dụ `distinct_values(attr) > 1`).
3. Bỏ câu mà mọi ứng viên cùng giá trị.
4. Bỏ câu đã có trong profile (chỉ tạo câu **xác nhận** nếu pack yêu cầu).
5. Cắt còn `CFG-ASK-MAX-Q`; phần còn lại dùng `default_rule` và ghi `source=default`.
6. Tối đa `CFG-ASK-MAX-TURNS` lượt trước đề xuất đầu tiên.
7. Mỗi câu có `options[]` (value, label_vi, hint_vi, suggested) và `allow_auto=true`.
**AC:**
- AC-102-1: **Cho** pack có 5 thuộc tính mandatory chưa rõ, **Khi** chọn câu hỏi, **Thì** trả đúng 3 câu theo `priority` và 2 thuộc tính còn lại nhận `default_rule`.
- AC-102-2: **Cho** thuộc tính mà mọi ứng viên cùng giá trị, **Thì** không có câu hỏi cho thuộc tính đó.
- AC-102-3: **Cho** profile đã có thuộc tính X, **Thì** không có câu hỏi X (chỉ có câu xác nhận nếu pack khai báo `confirm_from_profile`).
- AC-102-4: **Cho** `turn=3`, **Thì** không sinh thêm lượt hỏi; chuyển sang `evaluate`.
- AC-102-5: **Cho** mission giỏ định kỳ với profile đủ, **Thì** tối đa 1 câu hỏi.
- AC-102-6: **Cho** người mua dùng từ chỉ người mới (danh sách `beginner_markers` trong pack), **Thì** mỗi option có `hint_vi` và có khối "3 điều cần biết" (≤ 3 dòng từ `pack.beginner_explainers`).
- AC-102-7: **Cho** cùng input, **Thì** cùng danh sách câu và cùng thứ tự (tất định).
**Test:** unit trên pack giả 5 thuộc tính; property test tính tất định.

#### US-103 Trả lời câu hỏi và "Musk gợi ý" · P0
**Yêu cầu:** API-02 nhận `answers[{key, value|"auto"}]`. `auto` → áp `default_rule`, ghi `source=default`, thêm vào `mission.assumptions[]`.
**AC:**
- AC-103-1: **Khi** gửi `value="auto"`, **Thì** giá trị = kết quả `default_rule` và đề xuất hiển thị "Musk giả định: …" kèm nút sửa.
- AC-103-2: **Khi** gửi answers cho `question_set_id` đã bị thay thế, **Thì** 409 `ERR-QUESTION-STALE`.
- AC-103-3: **Khi** trả lời đủ, **Thì** `status=READY`; `next.type="evaluate"`.
- AC-103-4: **Cho** người mua bấm "Bỏ qua, dùng mặc định", **Thì** mọi câu chưa trả lời dùng `default_rule` và đánh dấu `source=default`.
- AC-103-5: **Cho** option không hợp lệ cho câu hỏi, **Thì** 400 `ERR-VALIDATION`.

#### US-104 Hồ sơ người mua · P0
**Yêu cầu:** `profile` (DM-01) do người mua nhập hoặc xác nhận; CRUD qua `PATCH /missions/{id}/preferences` (op `profile.set`, `profile.delete`) và UI "Sửa yêu cầu". Quy tắc riêng có `type` trong danh sách đóng.
**AC:**
- AC-104-1: **Cho** rule `shop_tier_in:[mall]` cho món X, **Thì** mọi offer cho X không phải Mall bị FAIL với `reason_code=PROFILE_RULE_TIER`.
- AC-104-2: **Cho** người mua xóa hồ sơ, **Thì** mọi thuộc tính profile bị xóa trong ≤ 1 giây và decision kế tiếp không dùng chúng.
- AC-104-3: **Cho** thuộc tính profile đổi (ví dụ kích cỡ), **Thì** tạo decision mới và diff nêu rõ nguyên nhân.
- AC-104-4: **Cho** profile sai kiểu dữ liệu, **Thì** 400 `ERR-VALIDATION`.

### E2. Offer và chuẩn hóa

#### US-201 Nạp snapshot offer · P0
**Yêu cầu:** Adapter `OfferSource.fetch(query, mission_items) -> Snapshot`. MVP: đọc từ file/DB snapshot hợp lệ. Mỗi offer **bắt buộc** `source_url`, `observed_at`, `price_list`. Thuộc tính không có → `unknown`.
**AC:**
- AC-201-1: **Cho** offer thiếu `source_url` hoặc `observed_at`, **Thì** offer bị loại khỏi snapshot, ghi audit `EVT-OFFER-REJECTED-INGEST`.
- AC-201-2: **Cho** snapshot có `offer_count < 3` cùng identity, **Thì** quyết định vẫn chạy nhưng `banners` có `LOW_OFFER_COUNT` với số lượng thật; nếu `0` → `ERR-INSUFFICIENT-EVIDENCE`.
- AC-201-3: **Cho** field không đọc được, **Thì** `Value.status="unknown"`, **không** điền giá trị mặc định.
- AC-201-4: **Cho** `mode=snapshot`, **Thì** UI hiển thị nhãn chế độ dữ liệu ("Dữ liệu mẫu") ở thanh trạng thái.
- AC-201-5: **Cho** `observed_at` cũ hơn `CFG-SNAP-STALE-H`, **Thì** decision có banner `STALE_SNAPSHOT`.

#### US-202 Chuẩn hóa và ghép · P0
Theo 7.1. **AC:**
- AC-202-1: **Cho** offer khác khóa định danh, **Thì** `rejected_norm` với `NORM_IDENTITY_MISMATCH`, không chạy `ENG-05`.
- AC-202-2: **Cho** biến thể lệch giá ≥ `CFG-ASK-VARIANT-PRICE-GAP-PCT` và người mua chưa nói, **Thì** `ask_variants` có đúng 1 mục; không hỏi lại trong cùng mission sau khi đã trả lời.
- AC-202-3: **Cho** tiêu đề mâu thuẫn trường cấu trúc, **Thì** identity theo trường cấu trúc và có `RF_TITLE_CONFLICT`.
- AC-202-4: **Cho** listing nhiều biến thể, **Thì** sinh nhiều offer ảo, mỗi offer có `variant_label` và giá riêng.
- AC-202-5: **Cho** parser LLM trả giá trị ngoài `options` của pack, **Thì** giá trị bị bỏ, `status=unknown`.
- AC-202-6: **Cho** 100 offer fixture đã gắn nhãn, **Thì** độ chính xác ghép đúng identity ≥ 95% (mục tiêu đo, ghi vào báo cáo).

#### US-203 Đơn giá chuẩn hóa · P0
**AC:**
- AC-203-1: `unit_price = final_line_price / (pack_count × units_per_pack)` làm tròn đến đồng; đơn vị lấy từ `pack.unit`.
- AC-203-2: **Cho** hai offer khác quy cách, **Thì** `matched` kèm `unit_price` cùng đơn vị để so sánh.
- AC-203-3: **Cho** offer rẻ hơn ≥ 5% theo đơn giá nhưng khác quy cách người mua chỉ định, **Thì** chỉ **gợi ý** (`suggestion`), không tự đổi.

### E3. Điều kiện và bằng chứng

#### US-301 Constraint PASS/FAIL/UNKNOWN · P0
Theo 7.2 và 7.3. **AC:**
- AC-301-1: **Cho** bất kỳ hard check = FAIL, **Thì** `status=FAIL` và offer không vào `ranked`.
- AC-301-2: **Cho** không FAIL và có hard = UNKNOWN, **Thì** `status=UNKNOWN`; offer không vào `ranked`, không thể là winner, không vào giỏ.
- AC-301-3: **Cho** `Value.status=claimed_by_shop` cho constraint `assurance` bắt buộc, **Thì** UNKNOWN.
- AC-301-4: **Cho** `claimed_by_shop` cho `delivery_deadline`, **Thì** PASS nếu `days_max` đáp ứng.
- AC-301-5: **Cho** `delivery_deadline=2`, `days_min=1`, `days_max=3`, **Thì** FAIL (thận trọng).
- AC-301-6: **Cho** `budget_item` với `tol=approx` và giá vượt trong 3%, **Thì** PASS và `explanation` có cảnh báo "vượt ngân sách X".
- AC-301-7: **Cho** offer UNKNOWN, **Khi** (a) rẻ hơn winner ≥ `CFG-UNKNOWN-ASK-GAP-PCT` hoặc lọt top 1 theo U nếu coi PASS, **và** (b) người mua có thể xử lý (chấp nhận rủi ro/tự kiểm tra), **Thì** thuộc `ask_candidates`; ngược lại chỉ vào `excluded` loại "Chưa chắc" và **không** hỏi.
- AC-301-8: **Cho** mỗi constraint, **Thì** `checks[]` lưu `reason_code` và `evidence_ids` để giải thích.
- AC-301-9: **Cho** ngành L0, **Thì** không constraint nào được nâng lên verified.
**Test:** bảng quyết định hóa (decision table) 40+ ca; property: FAIL > UNKNOWN > PASS.

#### US-302 Gợi ý nới điều kiện · P0
Theo 7.4. **AC:**
- AC-302-1: **Cho** không có PASS và nới hạn giao +1 ngày cho ra ≥ 1 PASS, **Thì** `relaxations[0]` có `winner_offer_id` và `final`.
- AC-302-2: **Cho** chỉ có thể thắng bằng cách bỏ `identity`, **Thì** không đề xuất.
- AC-302-3: **Cho** nới không tạo PASS nào, **Thì** `relaxations=[]` và trả `ERR-INSUFFICIENT-EVIDENCE` hoặc HỎI LẠI nêu rõ điều kiện cần đổi.
- AC-302-4: **Cho** người mua chọn một nới, **Thì** tạo decision mới với constraint đã nới và `source=user_said`.

#### US-303 Trust shop · P0
`ENG-07` theo 6.7. **AC:**
- AC-303-1: **Cho** shop rating 5.0, n=3, **Thì** `rating_adj ≈ 4,565` và không nhận +4 điểm.
- AC-303-2: **Cho** fixture K/L/P/Q (PRD phụ lục), **Thì** `trust_v1` lần lượt 9,60 / 7,60 / (theo công thức) / 9,59 (sai số ≤ 0,01).
- AC-303-3: **Cho** field null, **Thì** không trừ điểm cho field đó và dùng công thức v1 cho phần rating.
- AC-303-4: **Cho** red flag major, **Thì** `trust_score=null`, offer bị loại.

#### US-304 Rating lọc seeding · P0
`ENG-08` theo 6.9. **AC:**
- AC-304-1: **Cho** < `CFG-SEED-MIN-REVIEWS` đánh giá, **Thì** `rating_filtered=null` và UI hiện "Chưa đủ dữ liệu lọc (dưới 30 review)".
- AC-304-2: **Cho** fixture có 61 review 5★ ngắn trong 48h, **Thì** các review này bị loại và `removed_count` ≥ 61.
- AC-304-3: **Cho** hai review giống ≥ 0,9 với ≥ 3 review khác, **Thì** bị đánh dấu `S2`.
- AC-304-4: **Cho** UI, **Thì** hiển thị cả rating gốc và đã lọc, số loại và lý do; dùng từ "nghi", không dùng "giả".
- AC-304-5: **Cho** `review_count/sold > 0,6`, **Thì** cờ shop `S5` (không loại từng review).
- AC-304-6: **Cho** ví dụ bị loại hiển thị, **Thì** tên người đánh giá đã che và tối đa 3 ví dụ.

#### US-305 Review 1–3★ theo chủ đề · P0
**Yêu cầu:** LLM trích `{aspect, polarity, quote_span}` (schema cố định, tối đa `CFG-REVIEW-SAMPLE-MAX`), engine tổng hợp `ENG-09`. Mỗi nhóm có `type ∈ {product, delivery, shop_service}` theo `pack.defect_types`.
**AC:**
- AC-305-1: **Cho** review 1–3★ trong `CFG-LOWSTAR-WINDOW-D` ngày, **Thì** nhóm theo chủ đề với `count`, `share` (trên tổng 1–3★), `type`.
- AC-305-2: **Cho** ≥ `CFG-LOWSTAR-NEW-SHARE` số review nhóm nằm trong `CFG-LOWSTAR-NEW-D` ngày gần nhất, **Thì** `is_new=true` và UI có nhãn "Mới xuất hiện".
- AC-305-3: **Cho** quote hiển thị, **Thì** khớp **nguyên văn** một `review.id` trong snapshot (test tự động so chuỗi).
- AC-305-4: **Cho** không có review hợp lệ, **Thì** UI "Chưa có đánh giá đủ thông tin", không sinh nội dung.
- AC-305-5: **Cho** nhóm `type=product` lặp lại ≥ ngưỡng của `pack.red_flags`, **Thì** phát `RF_QUALITY_REPEAT`.
- AC-305-6: **Cho** shop có phản hồi cho review xấu, **Thì** hiển thị "Shop trả lời X/Y đánh giá thấp".

#### US-306 Red flag · P0
**AC:**
- AC-306-1: **Cho** red flag `level=major, effect=exclude`, **Thì** offer FAIL với `reason_code=RF_<code>` và có trong "Không chọn vì".
- AC-306-2: **Cho** red flag `minor/medium effect=penalty`, **Thì** trừ trust theo 6.7 và hiển thị cảnh báo ngay trong thẻ sản phẩm.
- AC-306-3: **Cho** `RF_PRICE_TOO_LOW` kèm shop `normal` tuổi < 12 tháng, **Thì** nâng lên major.
- AC-306-4: **Cho** `when` của pack chứa cú pháp không hợp lệ, **Thì** pack bị từ chối ở US-801, không crash runtime.

#### US-307 Độ tin của bằng chứng · P0
`ENG-11`: `high` nếu mọi field quyết định `verified`, snapshot ≤ `CFG-SNAP-WARN-H`, ≥ 20 review hữu ích; `low` nếu snapshot > `CFG-SNAP-STALE-H`, hoặc < 5 review hữu ích, hoặc `RF_FAKE_REVIEWS`, hoặc ngành L0; còn lại `medium`. **AC:**
- AC-307-1: **Cho** ba mức, **Thì** không cộng vào U.
- AC-307-2: **Cho** `low` và giá trị > ngưỡng cao, **Thì** `decide` ra `ASK CONFIRM_STALE_OR_LOW_EVIDENCE`.
- AC-307-3: **Cho** hiển thị, **Thì** nhãn "Musk chắc / chưa chắc" chỉ nằm ở chi tiết, không ở tóm tắt.

### E4. Giá

#### US-401 Giá cuối một đơn · P0
`ENG-12` theo 6.4. **AC:**
- AC-401-1: **Cho** fixture (giá niêm yết 18.190.000, voucher shop −150.000 đơn từ 15.000.000, voucher Mall −200.000), **Thì** `net=17.840.000`.
- AC-401-2: **Cho** subtotal < `min_spend`, **Thì** voucher không áp.
- AC-401-3: **Cho** hai voucher cùng slot, **Thì** chọn giảm nhiều nhất; không cộng cả hai.
- AC-401-4: **Cho** voucher percent có cap, **Thì** `giảm = min(floor(base×pct/100), cap)`.
- AC-401-5: **Cho** `platform_min_spend_base` đổi trong config, **Thì** kết quả đổi tương ứng mà không đổi code.
- AC-401-6: **Cho** xu/khuyến mãi thanh toán, **Thì** không trừ; `price_note_vi="Có thể rẻ hơn nếu dùng Xu hoặc ưu đãi thẻ — Musk chưa tính."`.
- AC-401-7: **Cho** breakdown, **Thì** lưu đủ từng bước vào decision (audit) nhưng UI không hiển thị trừ khi mở "Xem so sánh chi tiết".
- AC-401-8: **Cho** tổng, **Thì** là số nguyên VND, không có sai số float (test với 10.000 ca ngẫu nhiên so với tính bằng `Decimal`).

#### US-402 Tối ưu giỏ nhiều món · P0
`ENG-13` theo 6.5. **AC:**
- AC-402-1: **Cho** fixture giỏ mẫu (PRD phụ lục C.2), **Thì** `best.total=1.262.000`, `saving=20.000`.
- AC-402-2: **Cho** hai tổ hợp chênh ≤ 1.000đ, **Thì** chọn tổ hợp ít shop hơn, rồi trust TB cao hơn.
- AC-402-3: **Cho** 6 món × 8 offer, **Thì** hoàn tất < 500 ms và `total ≤ greedy`.
- AC-402-4: **Cho** `saving < CFG-SAVING-MIN`, **Thì** UI không hiển thị dòng tiết kiệm.
- AC-402-5: **Cho** tổng vượt ngân sách tháng, **Thì** `over_budget` và `alt` (bớt 1 đơn vị của món có thể bớt) kèm tổng mới.
- AC-402-6: **Cho** món bù min spend, **Thì** chỉ gợi ý khi `gap ≤ voucher` và `gap ≤ CFG-ADDON-GAP-PCT × subtotal`, món thuộc danh sách định kỳ của profile; **không** tự thêm vào giỏ.
- AC-402-7: **Cho** cùng input, **Thì** cùng output (tất định, chạy 100 lần byte-identical).
- AC-402-8: **Cho** một món không có PASS, **Thì** giỏ vẫn tối ưu cho các món còn lại và `outcome` là `ASK ITEM_UNRESOLVED` cho món thiếu.

#### US-403 Voucher cá nhân từ ảnh · P0
**Yêu cầu:**
- UI chỉ hiện ở ApproveCard, một lần; hiện lại khi tổng giỏ đổi ≥ `CFG-VOUCHER-REPROMPT-DELTA`; "Bỏ qua" thì không nhắc lại trong phiên.
- API-08: nhận ≤ `CFG-UPLOAD.max_files` ảnh, mỗi ảnh ≤ `max_mb`, MIME ∈ `mime`. `VoucherReader` trả `Voucher[]` kèm `confidence`.
- Người mua **xác nhận/sửa** trước khi tính (API-09). Chỉ voucher `confidence=ok` và đủ trường mới được trừ.
- Sau xác nhận: tạo decision mới; `diff` nêu mức tiết kiệm và mã cần chọn.
- Xóa ảnh gốc ngay sau khi trích; che thông tin cá nhân; có nút xóa dữ liệu voucher (API-10).
**AC:**
- AC-403-1: **Cho** voucher thiếu `min_spend`, **Thì** không trừ và UI hỏi "voucher này áp cho đơn từ bao nhiêu?".
- AC-403-2: **Cho** người mua chưa xác nhận danh sách mã đọc được, **Thì** giá cuối **không** đổi.
- AC-403-3: **Cho** voucher hợp lệ (8%, cap 300.000, đơn từ 10.000.000, shop Mall), **Thì** `net` giảm đúng `min(floor(base×0,08), 300000)` và `version+1`.
- AC-403-4: **Cho** xử lý xong, **Thì** `source_image_deleted_at` có giá trị và tệp gốc không còn trong lưu trữ (test kiểm tra thư mục/object store).
- AC-403-5: **Cho** ảnh chứa tên/số điện thoại/số dư, **Thì** các vùng đó không xuất hiện trong dữ liệu lưu (test với fixture có PII giả).
- AC-403-6: **Cho** copy giao diện, **Thì** có đúng câu "Musk không cần mật khẩu Shopee. Ảnh được xóa sau khi đọc." (kiểm bằng snapshot UI).
- AC-403-7: **Cho** mã `confidence=unsure`, **Thì** hiển thị "Musk đọc chưa chắc — kiểm tra lại", mặc định **không tick**.
- AC-403-8: **Cho** ảnh sai định dạng/quá lớn/không đọc được, **Thì** lần lượt 415 / 413 / 422 với thông điệp tiếng Việt, người mua có thể thử lại.
- AC-403-9: **Cho** voucher hết hạn trước ngày giao, **Thì** không trừ và ghi "hết hạn".
- AC-403-10: **Cho** hai voucher cá nhân cùng slot, **Thì** chỉ dùng cái giảm nhiều nhất và nêu mã còn lại không dùng được.
- AC-403-11: **Cho** thông điệp cuối, **Thì** có câu "Voucher có thể đã hết lượt dù còn hạn. Giá cuối thật là giá ở màn thanh toán Shopee."

### E5. Quyết định

#### US-501 Chấm điểm và xếp hạng · P0
`ENG-14` theo 6.6. **AC:**
- AC-501-1: **Cho** fixture điện thoại (PRD phụ lục C.1), **Thì** `U(B)=7,68`, `U(C)=9,20` với preset mặc định.
- AC-501-2: **Cho** preset "giao nhanh", **Thì** `U(B)=7,94`, `U(C)=7,74`.
- AC-501-3: **Cho** `p_min` đổi do thêm offer đắt, **Thì** điểm giá của các offer còn lại **không** đổi (khác min–max v1).
- AC-501-4: **Cho** `days_max=null` và mission có hạn giao, **Thì** offer không thể thắng.
- AC-501-5: **Cho** câu "cần trong 2 ngày", **Thì** `ENG-22` trả **hard constraint** `delivery_deadline=2` (không phải trọng số).
- AC-501-6: **Cho** các câu "rẻ nhất", "uy tín", "gấp", **Thì** map đúng preset (bảng 11.2).
- AC-501-7: **Cho** mỗi thay đổi trọng số, **Thì** tạo decision mới (US-601).

#### US-502 Hai lựa chọn ngang nhau · P0
`ENG-15`. **AC:**
- AC-502-1: **Cho** `U1 − U2 < CFG-TIE-GAP` **hoặc** winner đổi ở ≥ 2 kịch bản (preset, trọng số ±`CFG-SENS-WEIGHT-DELTA`), **và** hai offer khác nhau ở đúng một chiều người mua tự cân được, **Thì** `is_tie=true` → `ASK PICK_ONE_OF_TWO`.
- AC-502-2: **Cho** `PICK_ONE_OF_TWO`, **Thì** UI TieCard hiển thị hai thẻ cạnh nhau, mỗi thẻ có câu "Chọn cái này nếu bạn …", **không** có nút Duyệt.
- AC-502-3: **Cho** người mua chọn một thẻ, **Thì** tạo decision mới với `outcome=BUY` cho offer đã chọn; `diff` nêu lựa chọn.
- AC-502-4: **Cho** winner đổi ở đúng 1 kịch bản, **Thì** `flip_conditions` có đúng 1 câu gợi ý ("Nếu bạn cần nhận sớm, {shop} hợp hơn") thay vì TieCard.

#### US-503 Chính sách MUA/CHỜ/HỎI LẠI · P0
`ENG-16`, `ENG-17` theo 6.2, 6.8. **AC:**
- AC-503-1: **Cho** bảng 6.2, **Thì** có test cho từng dòng (8 test) và test thứ tự ưu tiên khi nhiều điều kiện cùng đúng.
- AC-503-2: **Cho** không có `price_history`, **Thì** `wait=false` và outcome là `BUY` kèm `timing.text_vi` thuộc `TXT-TIMING-0`.
- AC-503-3: **Cho** hàng tiêu hao với `days_of_stock < 5`, **Thì** không bao giờ `WAIT` và không hiển thị lời khuyên chờ.
- AC-503-4: **Cho** `mission.urgent=true` hoặc người mua cần nhận trong thời hạn ngắn hơn sale, **Thì** `timing.show=false`.
- AC-503-5: **Cho** sự kiện nhỏ, **Thì** `expected_pct` nhân `CFG-SALE-MINOR-FACTOR`.
- AC-503-6: **Cho** bất kỳ text `timing`, **Thì** không chứa cụm cấm (mục 11.3).
- AC-503-7: **Cho** ngành L0 và giá > `CFG-HIGH-VALUE-DEFAULT`, **Thì** không bao giờ `BUY` trực tiếp (luôn `ASK CONFIRM_STALE_OR_LOW_EVIDENCE` với nội dung xác nhận).

#### US-504 Lời giải thích có nguồn · P0
`ENG-18`, `ENG-19`. **Yêu cầu:** LLM chỉ điền template từ slot; mọi số trong câu phải nằm trong slot; validator bằng code.
**AC:**
- AC-504-1: **Cho** mỗi claim giá/shop/review/bảo đảm, **Thì** có `evidence_ids[]` truy được.
- AC-504-2: **Cho** claim không map được evidence, **Thì** bị loại **trước** khi trả API; có audit `EVT-CLAIM-DROPPED`.
- AC-504-3: **Cho** field `claimed_by_shop`, **Thì** câu hiển thị kèm "shop tự ghi / chưa xác minh"; `unknown` → "không ghi".
- AC-504-4: **Cho** có offer tốt hơn ở một chiều, **Thì** `tradeoff` bắt buộc có.
- AC-504-5: **Cho** `reasons`, **Thì** tối đa 3, xếp theo sub-score đóng góp lớn nhất vào khoảng cách với #2.
- AC-504-6: **Cho** mọi số trong `headline/reasons/tradeoff`, **Thì** xuất hiện trong `slots` (test hậu kiểm bằng regex số).
- AC-504-7: **Cho** nội dung, **Thì** không chứa cụm cấm.
- AC-504-8: **Cho** người mua bận, **Thì** ≤ 4 dòng/giỏ + 1 dòng tiết kiệm; người mới → headline + 3 lý do + 1 đánh đổi + mẹo kiểm tra.

### E6. Phiên bản và duyệt

#### US-601 Phiên bản quyết định và diff · P0
**Yêu cầu:** Tạo decision mới khi: đổi ưu tiên/trọng số; đổi ngân sách; thêm/bớt/đổi số lượng món; khóa/đổi món; thêm/xóa voucher cá nhân; trả lời câu HỎI LẠI; snapshot mới có giá/tồn kho/voucher khác; voucher hết hạn; người mua bấm cập nhật giá; đổi hồ sơ; chọn lại biến thể.
**AC:**
- AC-601-1: **Cho** decision mới, **Thì** `version = current_version + 1`, `parent_version = current_version`; decision cũ không đổi.
- AC-601-2: **Cho** decision mới, **Thì** mọi approval `ACTIVE` của mission → `VOID` trong cùng giao dịch.
- AC-601-3: **Cho** `diff`, **Thì** ≤ 2 dòng, nguyên nhân lấy từ thay đổi trực tiếp (constraint/weight vừa đổi) chứ không đoán.
- AC-601-4: **Cho** winner đổi, **Thì** diff dạng "Đổi từ A sang B vì {nguyên nhân}. Giá cuối ±X."
- AC-601-5: **Cho** winner không đổi, **Thì** "Vẫn là A; giá cuối {mới}" (nêu nguyên nhân giảm giá nếu có).
- AC-601-6: **Cho** UI, **Thì** card của phiên bản cũ chuyển trạng thái `superseded`: mờ, nút vô hiệu, nhãn "Phiên bản cũ, không còn dùng để duyệt".
- AC-601-7: **Cho** `inputs_hash`, **Thì** cùng input → cùng hash; đổi một giá trị → hash khác (test).
- AC-601-8: **Cho** hai request tạo decision đồng thời, **Thì** `UNIQUE(mission_id, version)` bảo đảm không trùng; request thua thử lại một lần.

#### US-602 Duyệt idempotent · P0
**Yêu cầu:** API-11 kiểm: (1) `decision_version == mission.current_version`; (2) `price_snapshot_hash` khớp; (3) `outcome` cho phép duyệt; (4) `Idempotency-Key`.
**AC:**
- AC-602-1: **Cho** duyệt hợp lệ, **Thì** 201, tạo `approval` và `handoff`.
- AC-602-2: **Cho** duyệt hai lần cùng `Idempotency-Key`/cùng version, **Thì** lần hai trả **cùng** `approval.id`, không tạo bản ghi thứ hai.
- AC-602-3: **Cho** duyệt v3 khi hiện tại là v4, **Thì** 409 `ERR-VERSION-MISMATCH` kèm `diff` v3→v4; UI hiện "Giỏ vừa thay đổi, xem lại trước khi duyệt".
- AC-602-4: **Cho** `price_snapshot_hash` không khớp, **Thì** 409 `ERR-SNAPSHOT-CHANGED`.
- AC-602-5: **Cho** `outcome.kind=ASK`, **Thì** 422 `ERR-NOT-APPROVABLE`.
- AC-602-6: **Cho** double-click UI, **Thì** nút bị vô hiệu sau lần bấm đầu và chỉ một request đi (E2E).
- AC-602-7: **Cho** race hai request duyệt đồng thời, **Thì** đúng một `approval` (test đồng thời).

#### US-603 Handoff mở Shopee · P0
**Yêu cầu:** Từ approval tạo `handoff.orders[]` (mỗi shop một đơn): `deeplink` tới sản phẩm, `vouchers_to_pick[]` (mã công khai và mã cá nhân cần chọn), `checklist_before_order[]` (theo `pack.buyer_checks` + chung: đúng biến thể, giá khớp). Musk **không** đặt hàng.
**AC:**
- AC-603-1: **Cho** giỏ n shop, **Thì** `orders.length = n`, thứ tự cố định theo `order_index`.
- AC-603-2: **Cho** snapshot cũ hơn `CFG-SNAP-WARN-H` khi mở deeplink, **Thì** UI nhắc "Giá trên Shopee có thể khác, kiểm tra giá cuối ở trang thanh toán".
- AC-603-3: **Cho** nút chính ở PayCard, **Thì** luôn là "Mở trên Shopee" cho đơn đầu chưa đặt; nút phụ "Đánh dấu đơn N đã đặt".
- AC-603-4: **Cho** đánh dấu đã đặt đủ mọi đơn, **Thì** mission → `HANDED_OFF` và UI chuyển bước 5.
- AC-603-5: **Cho** approval `VOID`, **Thì** API-12 trả 409 và deeplink cũ bị ẩn.
- AC-603-6: **Cho** nút "Nhắc tôi trước {sự kiện}", **Thì** tạo reminder (API-13); khi nhắc, hệ thống chạy lại `evaluate` trước khi hiển thị.

#### US-604 Audit log · P0
**AC:**
- AC-604-1: Các sự kiện bắt buộc: `EVT-MISSION-CREATED, EVT-QUESTIONS-SHOWN, EVT-ANSWERED, EVT-SNAPSHOT-LOADED, EVT-DECISION-CREATED, EVT-CLAIM-DROPPED, EVT-VOUCHER-UPLOADED, EVT-VOUCHER-CONFIRMED, EVT-VOUCHER-DELETED, EVT-APPROVED, EVT-APPROVE-REJECTED, EVT-HANDOFF-CREATED, EVT-ORDER-MARKED, EVT-LLM-CALL`.
- AC-604-2: **Cho** bảng `audit_event`, **Thì** append-only (không UPDATE/DELETE qua repository).
- AC-604-3: **Cho** mỗi request, **Thì** có `request_id` xuyên suốt.
- AC-604-4: **Cho** payload, **Thì** không chứa ảnh gốc, token, thông tin cá nhân thừa.

### E7. Giao diện chat

Tham chiếu hành vi: mockup. Dev dựng component thật theo đặc tả dưới đây.

#### UI-00 Quy ước chung
- Mọi bước là **card trong luồng chat**; Musk có `typing` ngắn trước khi hiện card.
- Mỗi card đúng **1 nút chính**; tối đa **2 hành động phụ** (nút viền hoặc link). Test snapshot kiểm số nút chính = 1.
- Dòng trạng thái trên cùng: `Bước {n}/5 · {tên}`; 5 bước: Hỏi, Đề xuất (gồm So sánh, Cần bạn chọn), Duyệt, Thanh toán, Sau khi nhận.
- Card cũ khi có phiên bản mới: `superseded` (US-601 AC-6).
- Văn bản UI lấy từ **bảng copy** `i18n/vi.json` (khóa `copy.*`), không hard-code trong component.

#### US-701 Khung chat và trạng thái bước · P0
Component `UI-ChatThread`, `UI-StatusBar`, `UI-MissionRail`, `UI-QuickChips`, `UI-Composer`. **AC:**
- AC-701-1: **Cho** `StatusBar`, **Thì** hiển thị `Bước n/5 · tên` và thanh 5 đoạn; cập nhật theo `outcome`/bước.
- AC-701-2: **Cho** `MissionRail` (≥ 1040px), **Thì** chỉ đọc: liệt kê điều kiện hiện hành, giá trị `source=default/inferred` có nhãn "Musk giả định", phiên bản đề xuất; ẩn dưới 1040px.
- AC-701-3: **Cho** `Composer`, **Thì** gõ tự do vẫn hoạt động; câu không hiểu → Musk trả câu hướng dẫn thay vì lỗi.
- AC-701-4: **Cho** `QuickChips`, **Thì** chip chỉ là lối tắt của một câu chat (gửi đúng như người mua gõ).
- AC-701-5: **Cho** chuyển ngành (nếu bật `feature.category_switcher`), **Thì** reset mission và luồng.
- AC-701-6: **Cho** nhãn chế độ dữ liệu, **Thì** luôn hiển thị khi `mode=snapshot`.

#### US-702 QuestionCard · P0
Props: `questions[]`, `turn`, `onSubmit(answers)`, `onSkip()`. **AC:**
- AC-702-1: **Cho** tối đa 3 câu, **Thì** mỗi câu có lựa chọn bấm được và lựa chọn "Chưa biết, Musk gợi ý giúp".
- AC-702-2: **Cho** chưa trả lời đủ câu bắt buộc, **Thì** nút "Tiếp tục" bị vô hiệu; "Bỏ qua, dùng mặc định" luôn khả dụng.
- AC-702-3: **Cho** lựa chọn `suggested`, **Thì** có nhãn "Musk gợi ý".
- AC-702-4: **Cho** sau khi gửi, **Thì** card chuyển trạng thái `answered` (thu gọn, chỉ giữ đáp án) và bubble của người mua hiển thị tóm tắt.
- AC-702-5: **Cho** `hint_vi` của người mới, **Thì** hiển thị ngay dưới nhãn lựa chọn.

#### US-703 ProposalCard · P0
Props: `decision`, `onApprove`, `onCompare`, `onEdit`. **AC:**
- AC-703-1: **Cho** `outcome.kind=BUY`, **Thì** hiển thị: nhãn MUA, loại shop, headline, giá cuối, dòng "đã gồm …", ≤ 3 lý do, 1 câu đánh đổi, rating gốc → đã lọc, khối "Vấn đề hay gặp" (nhãn loại + số lượt + %), giả định có thể sửa, `Vì sao Musk chọn shop này?` (mở rộng).
- AC-703-2: **Cho** cảnh báo FAIL/UNKNOWN liên quan winner, **Thì** nằm trong thẻ, không ở cuối trang.
- AC-703-3: **Cho** nút, **Thì** chính = "Duyệt giỏ này"; phụ = "So sánh 2 lựa chọn khác" (ẩn nếu < 2 lựa chọn), "Sửa yêu cầu" (link).
- AC-703-4: **Cho** `banners` có `STALE_SNAPSHOT`, **Thì** xem US-706.
- AC-703-5: **Cho** `timing.show=true`, **Thì** ghi chú **không** xuất hiện ở ProposalCard (chỉ ApproveCard).
- AC-703-6: **Cho** khối chi tiết, **Thì** có bảng giá cuối (giá niêm yết, từng voucher, giá cuối), tín hiệu seeding, quote, ảnh người mua (≤ 3), thông tin shop, độ chắc bằng chứng, nguồn và thời điểm quan sát.
- AC-703-7: **Cho** thiếu dữ liệu ở một mục, **Thì** hiển thị câu fallback tương ứng ở bảng 11.4, không để trống.

#### US-704 CompareCard · P0
Props: `columns[]` (≤ 4: winner, các PASS theo U, tối đa 1 cột mờ "rẻ hơn nhưng bị loại"), `selected`. **AC:**
- AC-704-1: **Cho** hàng, **Thì** gồm: giá cuối (nhãn "Rẻ nhất"/"+X"), bảo đảm (xanh verified, vàng claimed, đỏ nhạt fail), nhận hàng, đánh giá (gốc → lọc, số, đã bán), người mua nói (quote 1 câu; viền vàng nếu quote cảnh báo).
- AC-704-2: **Cho** cột mờ, **Thì** nhãn "Rẻ hơn nhưng bị loại" và lý do ngắn; không chọn được.
- AC-704-3: **Cho** bấm cột đạt yêu cầu, **Thì** đổi lựa chọn và cập nhật nhãn nút chính "Chọn {shop}".
- AC-704-4: **Cho** chọn shop khác winner, **Thì** tạo decision mới (US-601) với diff.
- AC-704-5: **Cho** mục "Không chọn vì", **Thì** liệt kê mọi FAIL/UNKNOWN/red flag bằng câu ngắn; offer sai loại gom một dòng "N sản phẩm không đúng loại bạn cần" (mở ra xem).
- AC-704-6: **Cho** "Xem so sánh chi tiết", **Thì** có bảng thêm hàng: thuộc tính ngành, tuổi shop, phản hồi chat, đổi trả, kho gửi, voucher đã tính, lưu ý/red flag, độ chắc bằng chứng, nguồn và thời điểm.
- AC-704-7: **Cho** < 768px, **Thì** các cột xếp dọc.

#### US-705 CartCard (giỏ nhiều món) · P0
**AC:**
- AC-705-1: **Cho** giỏ, **Thì** mỗi món một dòng (ảnh, tên, quy cách, shop, đơn giá chuẩn hóa, giá dòng, 1 câu lý do), có nút "So sánh các shop" mở bảng nhỏ (cột = shop PASS + UNKNOWN, tối đa 4).
- AC-705-2: **Cho** tổng, **Thì** là giá cuối đã gồm voucher/ship; dòng tiết kiệm chỉ khi ≥ `CFG-SAVING-MIN`.
- AC-705-3: **Cho** thanh ngân sách tháng, **Thì** hiển thị `used/budget` và đổi màu khi vượt.
- AC-705-4: **Cho** thuộc tính phụ thuộc hồ sơ (ví dụ kích cỡ), **Thì** dòng có giải thích cách suy ra và nút đổi sang lựa chọn kề (nếu pack cho phép).
- AC-705-5: **Cho** món chưa chốt (`ITEM_UNRESOLVED`), **Thì** dòng cảnh báo vàng với các nút xử lý và nút Duyệt bị khóa kèm câu giải thích.
- AC-705-6: **Cho** chi tiết, **Thì** bảng đơn theo shop (tiền hàng, voucher, ship, thành tiền) nằm trong "Musk tính giỏ này thế nào?".

#### US-706 Card HỎI LẠI · P0
Một component `AskCard` với `ask_type`:

| `ask_type` | Nội dung | Hành động |
|---|---|---|
| `CONFIRM_RISK` | "Có 1 lựa chọn rẻ hơn nhưng {điều chưa chắc}. Bạn chấp nhận không?" + phương án an toàn | 2 nút trả lời; chính = phương án an toàn |
| `RELAX` | "Không có … Nếu {nới}: {shop}, {giá}." | Nút áp từng gợi ý |
| `OVER_BUDGET` | "Giỏ {X}, vượt ngân sách tháng {Y}. Bớt {món}?" | "Bớt …" (chính), "Giữ nguyên, nới ngân sách" |
| `PICK_ONE_OF_TWO` | TieCard (US-502) | Chọn một trong hai |
| `ITEM_UNRESOLVED` | Dòng cảnh báo trong CartCard | Theo món |
| `CONFIRM_STALE_OR_LOW_EVIDENCE` | Banner vàng "Giá quan sát lúc {thời điểm}, có thể đã đổi" | "Cập nhật giá" (chính) |

**AC:**
- AC-706-1: **Cho** `ask_type`, **Thì** có đúng 1 nút chính (trừ `PICK_ONE_OF_TWO` có 2 nút ngang hàng) và nút Duyệt không xuất hiện.
- AC-706-2: **Cho** "Cập nhật giá", **Thì** gọi API-04 + API-05, tạo phiên bản mới; thành công → banner biến mất, nút Duyệt trở lại.
- AC-706-3: **Cho** snapshot > `CFG-SNAP-STALE-H` và giá trị **dưới** ngưỡng cao, **Thì** banner hiện, vẫn duyệt được, độ chắc bằng chứng "thấp" và PayCard có nhắc kiểm tra giá.
- AC-706-4: **Cho** `CONFIRM_RISK` và người mua chấp nhận, **Thì** tạo decision mới có offer rủi ro làm winner và gắn cờ `risk_accepted=true` (hiển thị trong thẻ).

#### US-707 ApproveCard · P0
**AC:**
- AC-707-1: **Cho** nội dung, **Thì** theo thứ tự: giỏ rút gọn, **giá cuối**, dòng "đã gồm …", dòng "Có thể rẻ hơn nếu dùng Xu…", **khối voucher cá nhân** (US-403), ghi chú lưu ý của ngành (`pack.buyer_checks`), **ghi chú thời điểm** (nếu `timing.show`), nút.
- AC-707-2: **Cho** nút, **Thì** chính "Mua ngay"; phụ "Nhắc tôi trước {sự kiện}" (ẩn nếu không có sự kiện).
- AC-707-3: **Cho** ghi chú thời điểm, **Thì** nằm ngay trên hai nút và không xuất hiện ở card khác.
- AC-707-4: **Cho** voucher block, **Thì** chỉ xuất hiện ở ApproveCard (test: không có trong các card khác).
- AC-707-5: **Cho** sau "Mua ngay", **Thì** gọi API-11 rồi hiện PayCard; lỗi 409 → hiện diff.

#### US-708 PayCard và AfterCard · P0
**AC:**
- AC-708-1: **Cho** PayCard, **Thì** liệt kê từng đơn: shop, món, thành tiền, mã cần chọn, checklist có checkbox; trạng thái "Chưa đặt/Đã đặt".
- AC-708-2: **Cho** các nút, **Thì** chính "Mở đơn N trên Shopee" (N = đơn đầu chưa đặt), phụ "Đánh dấu đơn N đã đặt".
- AC-708-3: **Cho** AfterCard, **Thì** checklist từ `pack.unboxing_checklist`; nhắc "Chưa bấm 'Đã nhận hàng' trên Shopee trước khi kiểm tra xong"; nếu hàng tiêu hao, hiển thị lịch mua lại từ `consumption_model`.
- AC-708-4: **Cho** "Đã kiểm tra xong" khi chưa tick hết, **Thì** vẫn cho bấm nhưng Musk nhắc lại các mục chưa tick.
- AC-708-5: **Cho** "Báo vấn đề", **Thì** hiển thị hướng dẫn giữ bằng chứng và quy trình trả hàng, không hứa kết quả.

#### US-709 Responsive điện thoại · P1
**AC:** không tràn ngang ở 360–430px; nút xếp dọc ≥ 44px cao; bảng rộng cuộn ngang trong khung riêng; chip nhanh cuộn ngang; ẩn `MissionRail`; chạy Playwright ở 390×844 và 768×1024.

#### US-710 Trợ năng · P1
**AC:** tương phản ≥ WCAG AA (light và dark); toàn bộ thao tác dùng được bằng bàn phím với focus rõ; vùng `aria-live=polite` cho `StatusBar` và tin nhắn mới; nhãn cho nút chỉ có icon; tôn trọng `prefers-reduced-motion`.

### E8. Category Pack

#### US-801 Nạp và validate pack · P0
**Yêu cầu:** Pack là YAML/JSON theo schema 9.1; `POST /packs/validate` và kiểm khi khởi động. Pack không hợp lệ **không** nạp (hệ thống vẫn chạy với các pack còn lại).
**AC:**
- AC-801-1: **Cho** pack đúng schema, **Thì** nạp thành công và có trong registry theo `category_id`.
- AC-801-2: **Cho** pack thiếu trường bắt buộc/biểu thức không hợp lệ, **Thì** bị từ chối với danh sách lỗi (đường dẫn trường + thông điệp).
- AC-801-3: **Cho** pack kế thừa pack cha, **Thì** merge theo quy tắc (con ghi đè cha, mảng nối); vòng kế thừa bị từ chối.
- AC-801-4: **Cho** pack giả (ngành "kiểm thử" không có trong code), **Thì** hỏi đáp, chuẩn hóa và lọc chạy đúng **không sửa code** (test G22 bắt buộc).
- AC-801-5: **Cho** `pack.hash` đổi, **Thì** `config_hash` của decision đổi.

#### US-802 Chế độ chung L0 · P0
**Yêu cầu:** Không có pack khớp → `category_id=generic` với:
- Identity: lấy từ trường cấu trúc của listing (tên sản phẩm + biến thể đã chọn). Không đủ → không ghép.
- Câu hỏi: tối đa 2; chỉ thuộc tính biến thể mà các ứng viên **khác nhau thật** (màu, size, quy cách) và ngân sách nếu thiếu.
- Aspect review: bộ chung (đúng mô tả, chất lượng, đóng gói, giao hàng, tư vấn shop).
- Mọi `evidence_confidence = low`; không nâng claimed → verified.
- UI: nhãn "Musk chưa có hướng dẫn riêng cho ngành này, nên độ chắc chắn thấp hơn".
**AC:**
- AC-802-1: **Cho** yêu cầu không khớp pack, **Thì** mission chạy hết pipeline với `generic` và hiển thị nhãn.
- AC-802-2: **Cho** L0 và giá winner > `CFG-HIGH-VALUE-DEFAULT`, **Thì** không `BUY` trực tiếp (US-503 AC-7).
- AC-802-3: **Cho** L0, **Thì** không có `assurance` verified; sub-score bảo đảm tối đa 6.
- AC-802-4: **Cho** L0, **Thì** số câu hỏi ≤ 2 và chỉ về biến thể/ngân sách.

#### US-803 Hết hạn pack · P0
**AC:**
- AC-803-1: **Cho** `today > valid_as_of + CFG-PACK-TTL-DAYS`, **Thì** vẫn chạy nhưng UI hiển thị "Thông tin ngành này có thể đã cũ".
- AC-803-2: **Cho** pack hết hạn, **Thì** `evidence_confidence` không tăng từ pack (giữ nguyên các luật khác).
- AC-803-3: **Cho** endpoint nội bộ `GET /packs`, **Thì** liệt kê pack sắp hết hạn trong 14 ngày.

### E9. Dữ liệu, riêng tư, vận hành

#### US-901 Provenance và readiness gate · P0
**AC:**
- AC-901-1: **Cho** mỗi con số hiển thị (giá, rating, tuổi shop, ETA), **Thì** truy ngược được tới `offer.source_url` + `observed_at` (hoặc `evidence`).
- AC-901-2: **Cho** gate: ≥ 1 nguồn hợp lệ; ≥ 3 offer cùng identity (hoặc banner "chỉ có N lựa chọn"); đọc được giá, tình trạng, shop; field quan trọng có provenance hoặc `unknown`.
- AC-901-3: **Cho** không đạt gate, **Thì** `ERR-INSUFFICIENT-EVIDENCE`; **không** bịa giá, huy hiệu, chính sách.
- AC-901-4: **Cho** adapter live (P1), **Thì** tuân điều khoản nguồn; không có cơ chế vượt CAPTCHA/anti-bot trong code (review checklist).

#### US-902 Quyền riêng tư ảnh voucher và hồ sơ · P0
**AC:**
- AC-902-1: **Cho** ảnh upload, **Thì** lưu tạm trong vùng cô lập, xóa ngay sau khi `VoucherReader` hoàn tất hoặc lỗi, tối đa 10 phút (job dọn rác).
- AC-902-2: **Cho** dữ liệu voucher trích xuất, **Thì** tự xóa khi mã hết hạn hoặc sau `CFG-VOUCHER-RETENTION-D` ngày, hoặc khi người mua bấm xóa.
- AC-902-3: **Cho** hệ thống, **Thì** không có trường/bảng nào lưu mật khẩu, OTP, cookie Shopee (kiểm bằng lint schema).
- AC-902-4: **Cho** log/audit, **Thì** không chứa nội dung ảnh, họ tên, số điện thoại (test PII scanner trên log mẫu).
- AC-902-5: **Cho** người mua yêu cầu xóa hồ sơ, **Thì** `profile`, `voucher_personal` và liên kết tới mission bị xóa (xóa mềm không quá 24 giờ).

#### US-903 Logging, metric, feature flag · P1
**AC:**
- AC-903-1: Metric: số mission, phân bố `outcome`, tỷ lệ HỎI LẠI theo loại, p50/p95 thời gian `evaluate`, tỷ lệ claim bị loại, lỗi LLM, tỷ lệ phiên đến Duyệt.
- AC-903-2: Feature flag: `category_switcher`, `live_offers`, `llm_vision_voucher`, `timing_advice`.
- AC-903-3: Log có cấu trúc JSON, `request_id`, mức log; không log dữ liệu cá nhân.

---

## 9. Schema Category Pack (YAML)

### 9.1 Trường

```yaml
category_id: string              # unique, snake/dot case
extends: string|null
readiness: L1|L2
valid_as_of: date
source_urls: [url]
match: { keywords: [string], shopee_categories: [string] }
identity_keys: [attr_key]
variant_attrs: [attr_key]
attributes:                      # danh sách thuộc tính quyết định
  - key: string
    label_vi: string
    tier: mandatory|default|conditional
    priority: int                # 1 = hỏi trước
    options: [ { value: string, label_vi: string, hint_vi: string, suggested: bool } ]
    default_rule: { kind: const|expr, value: any }
    ask_if: expr|null            # biểu thức trên tập ứng viên
    confirm_from_profile: bool
    maps_to: { constraint: type, params: map }   # sinh constraint
parsers: { <attr_key>: [ { regex: string, map: { <captured>: <value> } } ] }
unit: { label: "đ/miếng", units_per_pack_attr: attr_key|const }
assurance_rules:
  levels: [ { id, label_vi, score_if_verified, score_if_claimed } ]
  verify: { any_of: [ cond ] }
  never_relax: [ constraint_type ]
review_aspects: [ { key, label_vi, keywords: [string] } ]
defect_types: { <aspect_key>: product|delivery|shop_service }
red_flags: [ { code, scope, level, when: expr, effect } ]
price_slope: number
sub_scores_enabled: [price, trust, assurance, speed, freshness]
presets: { <name>: {price,trust,assurance,speed} }   # tùy chọn, ghi đè mặc định
sale_expectation: { major: number, minor: number }    # % kỳ vọng (nếu có dữ liệu)
min_abs_saving: int
wait_window_days: int
high_value_threshold: int
consumption_model: { unit_per_day: {min:number,max:number}, pack_units: number }|null
beginner_markers: [string]
beginner_explainers: [ { term, text_vi } ]
buyer_checks: [ { key, text_vi, severity } ]
unboxing_checklist: [ { key, text_vi } ]
```

### 9.2 Biểu thức (`expr`)

Ngôn ngữ biểu thức **an toàn** (không `eval`): toán tử `== != < <= > >= and or not in`, hàm `count()`, `distinct_values()`, `has()`, `months_between()`, truy cập `offer.attrs.<key>.v`, `shop.<field>`, `review_stats.<field>`. Thư viện parser có test (cú pháp sai bị từ chối ở US-801).

---

## 10. Bảng trạng thái (state machine)

### 10.1 Mission
`CLARIFYING → READY` (đủ thuộc tính) · `READY → EVALUATED` (có decision) · `EVALUATED → EVALUATED` (decision mới) · `EVALUATED → APPROVED` (duyệt hợp lệ) · `APPROVED → EVALUATED` (decision mới làm approval VOID) · `APPROVED → HANDED_OFF` (đã đánh dấu đủ đơn) · `* → CLOSED` (hết hạn phiên hoặc người mua đóng).

### 10.2 Decision outcome → hành động UI

| `outcome` | Card | Nút chính | Duyệt được? |
|---|---|---|---|
| BUY | ProposalCard / CartCard | Duyệt giỏ này | Có |
| WAIT | ProposalCard (WAIT) | Mua luôn | Có (qua "Mua luôn") |
| ASK CONFIRM_RISK | AskCard | Phương án an toàn | Không |
| ASK RELAX | AskCard | Áp gợi ý | Không |
| ASK OVER_BUDGET | AskCard | Bớt món | Không |
| ASK PICK_ONE_OF_TWO | TieCard | (hai nút ngang hàng) | Không |
| ASK ITEM_UNRESOLVED | CartCard + dòng cảnh báo | Duyệt (khóa) | Không |
| ASK CONFIRM_STALE_OR_LOW_EVIDENCE | ProposalCard + banner | Cập nhật giá | Không |

### 10.3 Approval
`ACTIVE → VOID` khi có decision mới. Không có chuyển trạng thái ngược.

---

## 11. Văn bản cố định, từ cấm, fallback

### 11.1 Template (TXT-*) — chỉ các slot `{}` được điền
- `TXT-HEAD-BUY`: "Musk chọn {shop} ({tier}): {final}, đã gồm {voucher_desc}."
- `TXT-TRADEOFF`: "Đổi lại: {weakness}. Nếu {need}, {shop2} {final2} (+{delta})."
- `TXT-EXCLUDED`: "{shop}: {final} — {reason_vi}."
- `TXT-UNSURE`: "Chưa chắc: {field} — {reason_vi}. Bạn có thể {self_check}."
- `TXT-TIMING-1`: "{event} còn {days} ngày. Các năm trước, sản phẩm tương tự thường có thêm mã giảm vào ngày này, nhưng Musk không chắc giá sẽ thấp hơn. Giá hiện tại {vs_median}."
- `TXT-TIMING-0`: "{event} còn {days} ngày. Các năm trước, sản phẩm tương tự thường có thêm mã giảm vào ngày này, nhưng Musk không chắc giá sẽ thấp hơn. Musk chưa có dữ liệu giá để so sánh. Nếu không gấp, bạn có thể chờ xem."
- `TXT-PRICE-NOTE`: "Có thể rẻ hơn nếu dùng Xu hoặc ưu đãi thẻ — Musk chưa tính."
- `TXT-VOUCHER-INVITE`: "Bạn có mã giảm giá riêng trên Shopee? Musk chỉ thấy mã công khai. Mã bạn đã lưu trong Shopee (Tôi → Kho Voucher) có thể giúp rẻ hơn."
- `TXT-VOUCHER-PRIVACY`: "Musk không cần mật khẩu Shopee. Ảnh được xóa sau khi đọc."

### 11.2 Preset (`CFG-PRESETS`) và map câu chat

| Preset | price | trust | assurance | speed |
|---|---|---|---|---|
| default | 40 | 30 | 20 | 10 |
| price | 60 | 20 | 15 | 5 |
| trust | 20 | 50 | 20 | 10 |
| speed | 25 | 25 | 15 | 35 |

| Câu (regex không phân biệt hoa thường, bỏ dấu) | Kết quả |
|---|---|
| `re nhat\|tiet kiem\|uu tien gia` | preset `price` |
| `an toan\|uy tin\|so hang gia` | preset `trust` |
| `can gap\|giao nhanh` (không có số ngày) | preset `speed` |
| `trong (\d+) ngay\|truoc thu (\d)` | hard `delivery_deadline` |
| `khong can gap` | `speed` weight = 5, cho phép WAIT |
| `can bang` | trọng số cân bằng (có thể dẫn tới TIE) |

### 11.3 Cụm cấm (kiểm bằng test trên mọi chuỗi sinh ra)
"chắc chắn rẻ hơn", "đảm bảo rẻ hơn", "giảm tới", "tốt nhất thị trường", "chắc chắn chính hãng" (khi chưa verified), "hàng giả" (dùng "nghi seeding"/"nghi"), lời khuyên đầu tư/tài chính.

### 11.4 Fallback dữ liệu thiếu

| Mục | Hiển thị khi thiếu |
|---|---|
| Rating đã lọc | "Chưa đủ dữ liệu lọc (dưới 30 review)" |
| Khiếu nại 1–3★ | "Chưa có đánh giá thấp" (không coi là tốt tuyệt đối khi review ít) |
| Ảnh người mua | Ẩn khối |
| Shop trả lời đánh giá xấu | "Không thấy phản hồi" |
| Tỷ lệ đổi trả | "Shopee không công bố" |
| Tồn kho biến thể | "Chưa xác định tồn kho" (HỎI LẠI nếu biến thể bắt buộc) |
| ETA | "Theo vị trí kho: {tỉnh}", không hứa ngày |
| Lịch sử giá | "Chưa có lịch sử giá. Không đánh giá được mức giảm." |
| Tuổi shop/phản hồi chat | UNKNOWN, không cộng điểm |
| Hóa đơn VAT | "Chưa rõ — hỏi shop trước khi mua" (nút soạn sẵn tin nhắn, người mua tự gửi) |
| Trung tâm bảo hành | Ẩn, ghi "Bảo hành theo shop" |
| Review hợp lệ cho quote | "Chưa có đánh giá đủ thông tin" |
| Ảnh sản phẩm lỗi | Placeholder trung tính |

---

## 12. Yêu cầu phi chức năng (NFR)

| ID | Yêu cầu | Cách kiểm |
|---|---|---|
| NFR-01 | `evaluate` (không tính LLM) p95 < 2 s với ≤ 50 offer/món, ≤ 5 món | Benchmark trong CI |
| NFR-02 | `optimize_cart` 262.144 tổ hợp < 500 ms | Benchmark |
| NFR-03 | Tất định: cùng input → output byte-identical (100 lần) | Test property |
| NFR-04 | Thời gian phản hồi LLM: timeout 10 s, retry 1 lần; lỗi LLM không làm hỏng quyết định đã tính | Test với mock |
| NFR-05 | Tiền là `int`; không dùng float cho VND | Lint + test |
| NFR-06 | Cấu hình tham số ngoài code; đổi tham số không cần deploy lại engine | Test nạp config |
| NFR-07 | Bảo mật: giới hạn kích thước/loại upload, chống path traversal, rate limit (60 req/phút/phiên), CSRF cho endpoint thay đổi trạng thái | Test bảo mật |
| NFR-08 | Quyền riêng tư: US-902 | Test |
| NFR-09 | Khả năng truy vết: mọi decision lưu `inputs_hash`, `config_hash`, `snapshot_id` | Test |
| NFR-10 | Trình duyệt hỗ trợ: 2 phiên bản mới nhất của Chrome, Safari, Edge, Firefox; iOS Safari và Chrome Android | E2E |
| NFR-11 | i18n: mọi chuỗi UI trong `vi.json`; không hard-code | Lint |
| NFR-12 | Độ phủ test: engine ≥ 90% dòng; 100% nhánh của `decide` và `price_order` | Coverage |
| NFR-13 | Không thể bypass: không có đường mã nào tạo `approval` ngoài API-11 | Review + test |

---

## 13. Kế hoạch kiểm thử và Definition of Done

### 13.1 Tầng test

| Tầng | Phạm vi | Công cụ |
|---|---|---|
| Unit (engine) | ENG-02…ENG-22; fixture ngành minh họa + pack giả | pytest, hypothesis (property) |
| Contract (API) | API-01…API-16, mã lỗi, idempotency, đồng thời | pytest + httpx |
| Component (UI) | UI-*; trạng thái; copy; số nút chính | Vitest/RTL + snapshot |
| E2E | Hành trình đầy đủ; thích nghi; duyệt cũ bị từ chối; điện thoại | Playwright |
| Nội dung | Cụm cấm; claim có nguồn; quote nguyên văn | Test tự động trên chuỗi sinh |
| Hiệu năng | NFR-01, NFR-02 | Benchmark |

### 13.2 Bộ test lõi bắt buộc (độc lập ngành)

| # | Kịch bản | Kỳ vọng | Story |
|---|---|---|---|
| T-01 | Offer rẻ nhất FAIL hard | Không được chọn; có trong "Không chọn vì" | US-301 |
| T-02 | UNKNOWN rẻ hơn nhưng không thể thắng | Không hỏi; "Chưa chắc" | US-301 |
| T-03 | Chỉ có UNKNOWN | `ASK CONFIRM_RISK`; không Duyệt | US-503 |
| T-04 | Thêm hard hạn giao | Decision mới, diff, approval cũ bị từ chối | US-601, 602 |
| T-05 | Ngân sách quá thấp | `ASK RELAX` kèm tác động | US-302 |
| T-06 | U chênh < 0,5 | TieCard, chưa Duyệt | US-502 |
| T-07 | Voucher thiếu min spend | Không trừ; hỏi | US-403 |
| T-08 | Voucher hợp lệ | Giá đổi, version +1 | US-403 |
| T-09 | Giỏ vượt ngân sách tháng | `ASK OVER_BUDGET` | US-402 |
| T-10 | Món thiếu PASS có UNKNOWN | `ASK ITEM_UNRESOLVED`, món khác vẫn hiện, Duyệt khóa | US-503 |
| T-11 | Snapshot > 72h, giá trị cao | Banner, `low`, `ASK CONFIRM_STALE…` | US-706 |
| T-12 | Duyệt hai lần | Một approval | US-602 |
| T-13 | Duyệt v3 khi hiện tại v4 | 409 + diff | US-602 |
| T-14 | Chạy 100 lần cùng input | Byte-identical | NFR-03 |
| T-15 | 6 món × 8 offer | < 500 ms, total ≤ greedy | US-402 |
| T-16 | Mọi quote hiển thị | Khớp nguyên văn `review.id` | US-305 |
| T-17 | Shop 5.0 với 3 review | `rating_adj ≈ 4,57` | US-303 |
| T-18 | Giá thấp hơn 20% trung vị, shop mới | RF nặng, loại | US-306 |
| T-19 | Có sale, không lịch sử giá | BUY + TXT-TIMING-0 | US-503 |
| T-20 | Hàng tiêu hao sắp hết | Không khuyên chờ | US-503 |
| T-21 | Ngành L0 | Có nhãn; không BUY trên ngưỡng | US-802 |
| T-22 | Pack giả, không sửa code | Chạy đúng | US-801 |
| T-23 | Claim thiếu evidence | Bị loại, có audit | US-504 |
| T-24 | Profile đã có thuộc tính | Không hỏi lại | US-102 |
| T-25 | Ảnh voucher có PII | PII không lưu; ảnh gốc xóa | US-403, 902 |
| T-26 | Chuỗi UI chứa cụm cấm | Test fail | US-504 |
| T-27 | Race hai approve | Một approval | US-602 |
| T-28 | Mọi card chỉ 1 nút chính | Snapshot UI đạt | UI-00 |

Fixture ngành minh họa (điện thoại, đồ em bé) và đáp án số học nằm trong `prd-musk-shopee-phu-luc.md`; dev chuyển thành `tests/fixtures/*.json`.

### 13.3 Definition of Done (mỗi story)
1. Mọi AC có test tự động pass trong CI.
2. Hàm engine thuần, có test tất định; không import ngoài danh sách cho phép.
3. API có contract test (thành công + mọi mã lỗi).
4. UI có test component và snapshot; chuỗi nằm trong `vi.json`.
5. Có audit event theo story.
6. Không thêm tham số số trong code (phải là `CFG-*`).
7. Tài liệu API (OpenAPI) cập nhật tự động.
8. Review: một dev khác + checklist riêng tư/an toàn.

### 13.4 Release gate MVP
- 100% test an toàn hard constraint (T-01..T-03, T-10) và ủy quyền duyệt (T-04, T-12, T-13, T-27) đạt.
- ≥ 90% tổng test đạt; 0 test cụm cấm fail.
- Ít nhất 1 hành trình hoàn chỉnh yêu cầu → mở Shopee ở mỗi ngành pilot.
- Ít nhất 1 kịch bản thích nghi kiểm chứng (T-04).
- T-22 (pack giả) đạt.
- NFR-01, NFR-02 đạt.

---

## 14. Quyết định cần chốt (chặn story)

| # | Câu hỏi | Chặn | Mặc định tạm nếu chưa chốt |
|---|---|---|---|
| D-01 | Ngành pilot cho MVP | US-801 nội dung pack, fixture, E2E | Dùng 2 ngành minh họa làm pack test |
| D-02 | Nguồn offer: snapshot do ai cung cấp, định dạng? | US-201 | JSON theo DM-07 |
| D-03 | Có truy cập Shopee Affiliate/Open Platform API? | Lịch sử giá, tồn kho biến thể, US-503 WAIT | Không có → WAIT tắt |
| D-04 | `platform_min_spend_base` (tính trước hay sau voucher shop) | US-401 | `list` (tham số) |
| D-05 | Ngưỡng freeship và phí ship | US-401 | `CFG-SHIP` (g) |
| D-06 | Nâng claimed → verified cho từng loại bảo đảm | US-301 | Theo `assurance_rules` của pack |
| D-07 | `high_value_threshold`, `price_slope`, `CFG-TIE-GAP` | US-501–503 | Mặc định bảng 3 |
| D-08 | Lưu dữ liệu voucher/ảnh (Nghị định 13/2023) | US-403, 902 | 30 ngày, xóa ảnh ngay |
| D-09 | Nhà cung cấp LLM/vision/OCR và ngân sách chi phí | US-101, 305, 403 | Adapter, chưa khóa nhà cung cấp |
| D-10 | Ai bảo trì Category Pack và quy trình kiểm duyệt | US-801, 803 | PM ngành + data, review bằng PR |
| D-11 | Danh sách sự kiện sale (lịch) và nguồn | US-503 | File `calendar.yaml` thủ công |
| D-12 | Phương thức xác thực/phiên người dùng | API (403), US-104 | Phiên ẩn danh theo cookie, chưa có đăng nhập |

---

## 15. Thứ tự triển khai đề xuất

| Giai đoạn | Nội dung | Story | Phụ thuộc |
|---|---|---|---|
| 0 | Khung repo, CI, import-linter, schema DB, config loader, pack loader + pack giả | US-801, hạ tầng NFR | — |
| 1 | Engine lõi không LLM: normalize, constraints, pricing, optimizer, scoring, decide, hash | US-202, 203, 301, 302, 303, 401, 402, 501, 502, 503 | 0, D-02 |
| 2 | Evidence: seeding, low-star, red flag, confidence (LLM adapter cho aspect) | US-304–307 | 1 |
| 3 | Mission + hỏi đáp (LLM parse) + profile | US-101–104, 802, 803 | 0, 1 |
| 4 | Explain + validate_claims + diff + versioning + approval + handoff + audit | US-504, 601–604 | 1, 2 |
| 5 | Chat UI: khung, QuestionCard, ProposalCard, CompareCard, CartCard, AskCard, ApproveCard, PayCard/AfterCard | US-701–708 | 3, 4 |
| 6 | Voucher cá nhân (upload, reader, xác nhận, xóa) | US-403, 902 | 4, 5 |
| 7 | Dữ liệu và vận hành: provenance, gate, metric, feature flag | US-901, 903 | song song |
| 8 | Responsive, trợ năng, hardening, E2E, benchmark | US-709, 710, NFR | 5 |

Mỗi giai đoạn kết thúc bằng demo chạy được và bộ test của giai đoạn đó pass.
