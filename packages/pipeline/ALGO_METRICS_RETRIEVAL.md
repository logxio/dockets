# Agent C 方案：算法 / 指标 / 检索（Matter Decision Pack）

> 目标：把“候选律所列表”升级成“可解释的决策引擎”——**默认给 Top 3 + 一句话原因 + 可点开的证据链**，且对数据稀疏/不确定性诚实展示。
>
> 协作边界：本文件与实现落在 `packages/pipeline/**`（Agent C 独占），不改 `api/**` 与 `packages/frontend/**`。

---

## 1) 懒人友好端到端路径（与 B 方案对齐）

用户只做 2 件事：
1) 用本地工具把 OCR PDF 转成 Markdown：`pdf2ai xxx.pdf --overwrite`（用户已配置）
2) 在前端粘贴/上传 `.md` → 前端把 `text` 发给 `POST /api/matters/parse-document`

系统自动完成：
- `parse-document`：抽取 Brief 字段（案由/角色/法院/对手/金额/时间点…）→ 用户“确认/一键修正”
- `candidates:recommend`：给出 Top 3（默认）+ 备选（折叠）+ 每家 1 句话“为什么”
- `evidence`：点开即见可追溯证据（CaseId / snapshot / why_relevant）

---

## 2) 数据模型（Phase-1 Offline KB 的可用字段）

当前离线快照（样例数据）可用：
- `mahari_exp_scores.csv`：全局 Firm 排名（`Rank`, `Firm`…）
- `mahari_fig2_moesm4_interactions.csv`：对抗/互动（`CaseId`, `PlaintiffFirm`, `DefendantFirm`, `CaseType`, `PredDefWinProba`, `Year`…）
- `mahari_fig2_moesm4_cases.csv`：案件表（`CaseId`, `CaseType`, `Year`, `Winner`…；`Winner: 0=PlaintiffWin, 1=DefendantWin`）

关键工程约定：
- `FirmKey`：对 `Firm` 做 normalize（小写、trim、空白压缩）作为主键（Phase-1 足够用）
- “证据数量”统计用 **unique CaseId**（避免 interactions 展开导致重复计数）

---

## 3) 推荐算法：从“能用”到“产品级”的两阶段

### 3.1 Candidate Generation（稳定 + 快）

输入：`caseType`（可空）、`role`（plaintiff/defendant，可空）

生成逻辑（已实现雏形）：
1) 取 `exp_scores` Top N（例如 2000）作为候选池（保证稳）
2) 用 `interactions` 统计 `(firm, role, caseType)` 的证据 CaseId 数
3) 排序：`EvidenceCount desc` + `Rank asc`

产品默认输出：
- Top 3（展开）
- Top 20（折叠 “更多备选”）

### 3.2 Rerank + Explain（可解释 + 不确定性）

为每个候选 firm 计算 4 类信号（用于重排与解释）：

1) **Outcome Signal（赢面）**
- 使用 `PredDefWinProba`（对 “defendant win” 的预测概率）
- defendant 角色：`pWin = mean(PredDefWinProba)`
- plaintiff 角色：`pWin = 1 - mean(PredDefWinProba)`
- 优先 head-to-head（对手 firm 存在时），否则退化到“该 firm 的所有相关样本”

2) **Evidence Strength（证据强度）**
- `nEvidenceCases = unique CaseId count`
- `confidence = high/medium/low/unknown`（用分段阈值即可）
- 小样本做 **shrinkage**：预测概率向 baseline 回缩（避免“3 个案子就 99%”的错觉）

3) **Fit Signal（匹配度）**
- caseType 匹配：同类案件加分，未知/模糊则不给分（不乱猜）
- court/jurisdiction（Phase-1 无数据）：只做展示占位，后续接入 CAP court 字段再上

4) **Cost Signal（费用）**
- Phase-1 样例里没有真实费率：先输出 `unknown`，但在 Pack 里明确标注“缺数据”
- Phase-2：引入市场费率区间/历史费用分布时，再进入重排权重（见 §7）

推荐解释模板（每家 1 句话）：
- “在 {caseType}/{role} 下有 {n} 个可追溯案例，预测胜率 {p}%（{confidence}），且存在/不存在对 {opponent} 的 head-to-head 证据。”

---

## 4) 证据检索（Evidence Retrieval）= “一键追溯”

目标：用户点开候选律所时，**第一屏就看到最相关的 5–10 条证据**，而不是“请自己筛选”。

检索优先级（已实现雏形）：
1) Head-to-head：firm vs opponent（同案由优先）
2) Firm-involved：该 firm 参与过的同类案件
3) CaseType-only：同案由的样本集合（用于解释 baseline / dataset coverage）

每条证据输出字段（建议固定）：
- `caseId`, `year`, `caseType`, `outcome`
- `similarity`（粗粒度即可：0.9/0.75/0.5）
- `whyRelevant`（数组：`["head-to-head","same case type"]` 等）
- `source`（`provider`, `snapshot`, `url?`）

---

## 5) 指标体系（面向“向老板解释”的最小集合）

推荐列表卡片（Top 3）建议只放 3 个数字 + 1 个标签：
- `Predicted Win Rate`（%）：核心结论
- `Evidence Cases`（#）：证据量
- `Win Rate Lift`（pp）：相对 baseline 的提升/下降
- `Confidence`（high/medium/low）：不确定性提示（强制展示）

Pack（Matter Decision Pack）里再展开：
- `Drivers`：case-type fit / head-to-head / sample size
- `Limitations`：settlement 未观测、数据覆盖偏差等
- `Evidence Table`：CaseId 可追溯清单

---

## 6) 评估与回归（离线可做，不依赖外网）

离线评估（用快照即可）：
- 概率质量：Brier / LogLoss / ECE（校准）
- 排序质量：NDCG@3、Hit@3（“把好 firm 顶上来”）
- 稳定性：不同随机种子/切分下 Top 3 一致性（防“忽上忽下”）

回归测试（工程角度）：
- `normalize_label` / firmKey 映射稳定
- `EvidenceCount` 必须按 unique CaseId
- 小样本 shrinkage 生效（n=1/2/3 不允许 0%/100% 极端输出）

---

## 7) Phase-2（产品变现所需的数据增量：收费模式 / 比价 / 可解释）

诉讼经理的真实问题是：**选谁 + 为什么 + 花多少钱**。

建议新增/补齐的可用数据（从低到高）：
1) firm profile（公开信息）：practice area、office、规模、费率区间（可能只能是粗区间）
2) 费率/收费模式：hourly / flat / contingency / hybrid（哪怕先由用户确认一次）
3) 相似案件费用分布：用内部历史 matter（若将来接入）

对应的算法扩展（可保持可解释）：
- `Expected Cost`：输出区间（P50/P90）+ 来源（public/estimated/user-provided）
- `Cost-Risk Frontier`：在 Pack 里给一张 “胜率 vs 预计费用” 的散点图（极易懂）
- `Sensitivity`：权重滑杆（偏好“更便宜/更稳/更快”），默认不让用户碰，高级选项折叠

---

## 8) 工程落地点（Agent C 待办，不与其他 Agent 打架）

仅列出会改动的范围（都在 `packages/pipeline/**`）：
- 增加 `pipeline/brief_normalize.py`：对 `caseType/role/opponent` 做稳健归一（同义词/空值策略）
- 增加 `pipeline/rerank.py`：把 outcome/evidence/fit/cost 组合成最终 Top 3（带可解释分解）
- 增加 `pipeline/shrinkage.py`：小样本回缩（Beta prior 或简单线性回缩都可）
- 扩展 `pipeline/matter_signals.py`：输出字段统一（建议全 camelCase 或全 snake_case，避免前后端打架）
- 添加 `packages/pipeline/tests/test_rerank.py`：保证排序/回缩/证据优先级的回归

