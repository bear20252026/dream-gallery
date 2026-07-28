// ===================== 答题进馆系统 =====================
// 规则:选科(理:语数英物化生 / 文:语数英史地政) → 随机9道选择(9分/题,选项乱序+答案锚定)
//      + 1道问答(19分,Kimi AI 评分,本地评分兜底) → 总分≥60(约答对6题)即可进入建筑
//      (2026-07-26 主人按《昆仑灵鉴》文档降难度:满分全通/≥60放行/<60仍可领邀请函进馆)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT } = require('./config');
const { sendJson, readBody } = require('./util');
const { gateData, saveGateData, deviceKey } = require('./store');

const QUIZ_PASS_SCORE = 60;
const QUIZ_TRACKS = {
  li: ['yuwen', 'shuxue', 'yingyu', 'wuli', 'huaxue', 'shengwu'],
  wen: ['yuwen', 'shuxue', 'yingyu', 'lishi', 'zhengzhi', 'dili'],
};
let quizBank = null;
function loadQuizBank() {
  if (quizBank) return;
  quizBank = { subjects: {}, qa: [], shen: null };
  const dir = path.join(ROOT, 'questions');
  const all = new Set([...QUIZ_TRACKS.li, ...QUIZ_TRACKS.wen]);
  for (const s of all) {
    try { quizBank.subjects[s] = JSON.parse(fs.readFileSync(path.join(dir, s + '.json'), 'utf8')); }
    catch (e) { console.error('题库加载失败:', s, e.message); quizBank.subjects[s] = []; }
  }
  try { quizBank.qa = JSON.parse(fs.readFileSync(path.join(dir, 'wenda.json'), 'utf8')); }
  catch (e) { console.error('问答题库加载失败:', e.message); }
  // 神话卷(2026-07-26 主人定):独立题库,90选择+10问答,均附解析;不与文理卷混用
  try { quizBank.shen = JSON.parse(fs.readFileSync(path.join(dir, 'shenhua.json'), 'utf8')); }
  catch (e) { console.error('神话题库加载失败:', e.message); quizBank.shen = { mc: [], qa: [] }; }
}
const quizSessions = new Map(); // sessionId -> {dk, mc, qa, ts}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 出卷:抽9题 → 答案字母按 2/2/2/3 均衡分布洗牌 → 正确内容锚定到指定字母,干扰项随机填充
// 神话卷(track=shen):独立题池(shenhua.json),逐题判后可显示正解+解析(主人特批,仅此卷)
function handleQuizStart(req, res, query) {
  loadQuizBank();
  if (query.track === 'shen') {
    const pool = quizBank.shen.mc, qaPool = quizBank.shen.qa;
    if (!pool || pool.length < 9 || !qaPool || qaPool.length === 0) { sendJson(res, 500, { error: '神话题库未就绪' }); return; }
    const picked = shuffle(pool).slice(0, 9);
    const seq = shuffle(['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'ABCD'[Math.floor(Math.random() * 4)]]);
    const letters = ['A', 'B', 'C', 'D'];
    const mc = picked.map((item, i) => {
      const correctLetter = seq[i];
      const wrongShuffled = shuffle(item.wrongs);
      const options = {};
      let wi = 0;
      for (const L of letters) options[L] = L === correctLetter ? item.correct : wrongShuffled[wi++];
      return { subject: item.subject, q: item.q, options, correctLetter, explain: item.explain || '' };
    });
    const qa = qaPool[Math.floor(Math.random() * qaPool.length)];
    const sessionId = crypto.randomBytes(8).toString('hex');
    quizSessions.set(sessionId, { dk: deviceKey(req), mc, qa, ts: Date.now(), track: 'shen' });
    for (const [id, s] of quizSessions) if (Date.now() - s.ts > 30 * 60 * 1000) quizSessions.delete(id);
    sendJson(res, 200, {
      sessionId,
      mc: mc.map(m => ({ subject: m.subject, q: m.q, options: m.options })),
      qa: { q: qa.q },
      passScore: QUIZ_PASS_SCORE, // 分数线单源下发(前端文案不再硬编码 60)
    });
    return;
  }
  const track = QUIZ_TRACKS[query.track];
  if (!track) { sendJson(res, 400, { error: 'track 必须是 li、wen 或 shen' }); return; }
  const pool = [];
  for (const s of track) pool.push(...quizBank.subjects[s]);
  if (pool.length < 9 || quizBank.qa.length === 0) { sendJson(res, 500, { error: '题库未就绪' }); return; }
  const picked = shuffle(pool).slice(0, 9);
  // 生成均衡字母序列: AABBCCD + 随机一个,共9个,再洗牌
  const seq = shuffle(['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'ABCD'[Math.floor(Math.random() * 4)]]);
  const letters = ['A', 'B', 'C', 'D'];
  const mc = picked.map((item, i) => {
    const correctLetter = seq[i];
    const wrongShuffled = shuffle(item.wrongs);
    const options = {};
    let wi = 0;
    for (const L of letters) options[L] = L === correctLetter ? item.correct : wrongShuffled[wi++];
    return { subject: item.subject, q: item.q, options, correctLetter };
  });
  const qa = quizBank.qa[Math.floor(Math.random() * quizBank.qa.length)];
  const sessionId = crypto.randomBytes(8).toString('hex');
  quizSessions.set(sessionId, { dk: deviceKey(req), mc, qa, ts: Date.now() });
  // 清理过期会话(30分钟)
  for (const [id, s] of quizSessions) if (Date.now() - s.ts > 30 * 60 * 1000) quizSessions.delete(id);
  sendJson(res, 200, {
    sessionId,
    mc: mc.map(m => ({ subject: m.subject, q: m.q, options: m.options })),
    qa: { q: qa.q, tags: qa.tags },
    passScore: QUIZ_PASS_SCORE, // 分数线单源下发(前端文案不再硬编码 60)
  });
}

// AI 阅卷(OpenAI 兼容接口):主评分通道;失败/未配置时自动回退本地细则
//   主: AI_GRADE_API_KEY / AI_GRADE_BASE_URL / AI_GRADE_MODEL
//   备: AI_GRADE_API_KEY_BACKUP / AI_GRADE_BASE_URL_BACKUP / AI_GRADE_MODEL_BACKUP
//       (sk-kimi- 开头的 Kimi Code 会员 key,走 coding 端点,kimi-for-coding 模型)
//   AI_GRADE_TEMPERATURE 共用
async function gradeQAWithAI(question, answer) {
  // 双接口模式:主通道申请不到(限流/欠费/超时)自动换备用通道
  const channels = [
    {
      key: process.env.AI_GRADE_API_KEY || '',
      url: process.env.AI_GRADE_BASE_URL || 'https://api.moonshot.cn/v1/chat/completions',
      model: process.env.AI_GRADE_MODEL || 'kimi-k2.6',
      maxTokens: 600,
    },
    {
      key: process.env.AI_GRADE_API_KEY_BACKUP || '',
      url: process.env.AI_GRADE_BASE_URL_BACKUP || 'https://api.kimi.com/coding/v1/chat/completions',
      model: process.env.AI_GRADE_MODEL_BACKUP || 'kimi-for-coding',
      maxTokens: 1500, // 思考型模型:留足推理 token,否则正文被截空
    },
  ].filter(c => c.key);
  if (!channels.length) return null;
  const temperature = parseFloat(process.env.AI_GRADE_TEMPERATURE || '1');
  for (const c of channels) {
    const r = await gradeWithKey(c.key, c.url, c.model, temperature, question, answer, c.maxTokens);
    if (r) return r;
  }
  return null;
}

async function gradeWithKey(key, url, model, temperature, question, answer, maxTokens) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model, temperature, max_tokens: maxTokens,
        messages: [
          { role: 'system', content: '你是温和的跨学科问答题阅卷老师,给考生答案打分(0-19的整数)。评分维度:切题与理解(0-8)、逻辑与论证(0-6)、知识与见解(0-5)。评分纪律(放宽):只要写了字且内容与题目相关(不是跑题/无关内容),最低给5分;内容一般但切题的答案给10分左右;写得很好(观点深刻、论证严密)鼓励给满分19;字数不是重要标准——写得多可适当加分,写得少不要扣分,25字左右的精彩答案同样可以给满分;少于25字最多给4分;跑题或完全无关给0-4分。只输出JSON:{"score":整数,"comment":"50字以内中文评语"}' },
          { role: 'user', content: `【题目】${question}\n\n【考生答案】${answer}` },
        ],
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const text = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
    const m = text.match(/\{[\s\S]*?\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    return {
      score: Math.max(0, Math.min(19, parseInt(j.score, 10) || 0)),
      comment: String(j.comment || '').slice(0, 150),
      by: 'ai',
    };
  } catch (e) {
    return null;
  }
}

// 本地评分细则(0~19,AI 阅卷不可用时的兜底;尽量少依赖关键词)
// 放宽纪律(2026-07-25 主人定):最低 25 字;切题保底 5 分;字数只加不扣;封顶 13(满分仅 AI 可给)
const QA_ARG_KWS = ['因为', '所以', '由于', '然而', '但是', '如果', '即使', '不仅', '而且', '从而', '进而', '可见', '例如', '本质', '逻辑', '意味着', '取决于'];
const QA_SEQ_KWS = ['首先', '其次', '再次', '最后', '第一', '第二', '第三', '一方面', '另一方面'];
const QA_SUM_KWS = ['综上', '总之', '由此可见', '因此', '总的来说', '归根结底'];

function gradeQALocal(question, answer) {
  // 有效字数(去掉空白字符)
  const effLen = [...answer.replace(/\s/g, '')].length;
  const rawLen = [...answer].length;
  const bd = [];
  if (effLen < 25) {
    return {
      score: 0, by: 'rubric',
      breakdown: [{ name: '篇幅', got: 0, max: 3, note: `有效字数${effLen}(总${rawLen}),不足25,不合格` }],
      comment: `有效字数不足(${effLen}字,不含空白),不计分`,
    };
  }
  // 1. 篇幅鼓励 0-3:只加不扣(写得多鼓励加分,写得少不扣分)
  const s1 = effLen >= 700 ? 3 : effLen >= 450 ? 2 : effLen >= 260 ? 1 : 0;
  bd.push({ name: '篇幅', got: s1, max: 3, note: `有效字数${effLen}` });
  // 2. 结构条理 0-5:分段/序列词/总结词
  const paras = answer.split(/\n+/).filter(p => p.trim()).length;
  const seqHits = QA_SEQ_KWS.filter(k => answer.includes(k)).length;
  const hasSum = QA_SUM_KWS.some(k => answer.includes(k));
  const s2 = Math.min(5, (paras >= 3 ? 3 : paras >= 2 ? 2 : 0) + (seqHits >= 2 ? 1 : 0) + (hasSum ? 1 : 0));
  bd.push({ name: '结构条理', got: s2, max: 5, note: `分段${paras} · 序列词${seqHits} · 总结词${hasSum ? '有' : '无'}` });
  // 3. 论证深度 0-6:通用论证连接词(非题目关键词,更普适) + 长句比例
  const kwHits = QA_ARG_KWS.filter(k => answer.includes(k)).length;
  const sentences = answer.split(/[。！？!?；;]/).filter(s => s.trim().length > 0).length;
  const s3 = Math.min(6, (kwHits >= 8 ? 4 : kwHits >= 5 ? 3 : kwHits >= 3 ? 2 : kwHits >= 1 ? 1 : 0) + (sentences >= 6 ? 2 : sentences >= 3 ? 1 : 0));
  bd.push({ name: '论证深度', got: s3, max: 6, note: `论证词${kwHits}个 · ${sentences}句` });
  // 4. 切题相关 0-5(核心维度):题目核心词命中率
  const terms = extractTerms(question);
  const hits = terms.filter(t => answer.toLowerCase().includes(t.toLowerCase()));
  const ratio = terms.length ? hits.length / terms.length : 0;
  const s4 = ratio >= 0.6 ? 5 : ratio >= 0.4 ? 4 : ratio >= 0.2 ? 2 : hits.length > 0 ? 1 : 0;
  bd.push({ name: '切题相关', got: s4, max: 5, note: `题目核心词命中${hits.length}/${terms.length}` });
  let total = s1 + s2 + s3 + s4;
  // 放宽纪律:写了字且切题(切题得分>0)保底 5 分
  if (s4 > 0) total = Math.max(5, total);
  return {
    // 本地细则无法判断"非常好",封顶13分;13分以上仅AI阅卷可给出
    score: Math.min(13, total), by: 'rubric', breakdown: bd,
    comment: bd.map(b => `${b.name} ${b.got}/${b.max}`).join(' · '),
  };
}
const QA_STOP = new Set(['什么', '如何', '是否', '为什么', '怎样', '谈谈', '论述', '分析', '我们', '人类', '如果', '就是', '还是', '或者', '以及', '可以', '能够', '应该', '这个', '那个', '他们', '自己', '没有', '不是', '都是', '通过', '进行', '之间', '这种', '那样', '其中', '关于', '对于', '根据', '按照', '作为', '成为', '认为', '说明', '表明', '指出', '提出', '问题', '角度', '方面', '方式', '意义', '影响', '作用', '关系', '区别', '联系', '发展', '变化', '过程', '结果', '原因', '可能', '需要', '一样', '一些', '一种', '一个']);

// 从题干提取核心词(2~8字中文实词 + 4字母以上英文词,去停用词)
function extractTerms(q) {
  const terms = new Set();
  const cn = q.replace(/【[^】]*】/g, '').match(/[\u4e00-\u9fa5]{2,8}/g) || [];
  for (const w of cn) {
    const parts = w.split(/[的了和与或及等对在是就为以把被让使于之其者所而若即乃]/).filter(p => p.length >= 2 && p.length <= 8);
    for (const p of parts) if (!QA_STOP.has(p)) terms.add(p);
  }
  const en = q.match(/[A-Za-z][A-Za-z-]{3,}/g) || [];
  for (const w of en) terms.add(w.toLowerCase());
  return [...terms].slice(0, 20);
}

async function handleQuizSubmit(req, res) {
  readBody(req, async obj => {
    const s = quizSessions.get(obj.sessionId);
    if (!s) { sendJson(res, 400, { error: '会话不存在或已过期,请重新出卷' }); return; }
    quizSessions.delete(obj.sessionId); // 一次性会话
    const answers = Array.isArray(obj.answers) ? obj.answers : [];
    let mcScore = 0;
    const review = s.mc.map((m, i) => {
      const chosen = String(answers[i] || '');
      const right = chosen === m.correctLetter;
      if (right) mcScore += 9;
      const item = { subject: m.subject, right }; // 文理卷:不返回正确答案/选项字母,防止外泄
      if (s.track === 'shen') { item.correctLetter = m.correctLetter; item.explain = m.explain || ''; } // 神话卷特批公开
      return item;
    });
    // 后台留档(仅后台导出/查看,不下发访客):完整题目+四选项内容+所选+正解
    const fullReview = s.mc.map((m, i) => ({
      subject: m.subject,
      q: m.q,
      options: m.options,                       // {A:'…',B:'…',C:'…',D:'…'} 含内容
      chosen: String(answers[i] || ''),          // 访客选的字母
      correctLetter: m.correctLetter,            // 正解字母
      right: String(answers[i] || '') === m.correctLetter,
    }));
    const qaText = String(obj.qaText || '').trim();
    // AI 语义阅卷优先,失败自动回退本地细则
    const grading = (await gradeQAWithAI(s.qa.q, qaText)) || gradeQALocal(s.qa.q, qaText);
    const total = mcScore + grading.score;
    const passed = total >= QUIZ_PASS_SCORE;
    // 通过则记录设备(永久有效)
    if (passed) {
      if (!gateData.quizPassed) gateData.quizPassed = {};
      gateData.quizPassed[s.dk] = Date.now();
    }
    // 答题记录:分数 + 问答题目与作答内容,供后台查看
    if (!gateData.quizAttempts) gateData.quizAttempts = [];
    gateData.quizAttempts.push({
      t: Date.now(),
      dk: s.dk,
      track: query2track(obj.track),
      mcScore,
      qaScore: grading.score,
      qaBy: grading.by,
      qaComment: grading.comment || '',
      total,
      passed,
      qaQ: s.qa.q,
      qaText: qaText.slice(0, 2000), // 作答原文(截断保护)
      review,
      fullReview, // 完整留档(题目/选项/所选/正解),仅后台导出用
    });
    if (gateData.quizAttempts.length > 200) gateData.quizAttempts.splice(0, gateData.quizAttempts.length - 200);
    saveGateData();
    sendJson(res, 200, {
      mcScore,
      qaScore: grading.score,
      qaComment: grading.comment,
      qaBreakdown: grading.breakdown,
      qaBy: grading.by,
      total,
      passed,
      invite: !passed, // 未达 60:前端展示「特别邀请函」,接受后仍可进馆(2026-07-25 主人定)
      qaExplain: s.track === 'shen' ? (s.qa.explain || '') : undefined, // 神话卷:问答题附出题意图+参考方向
      review,
    });
  });
}
// POST /api/quiz/judge:逐题批改(2026-07-26 主人定)——答一题判一题,判过即锁定
// 只回 right 布尔,绝不下发正解字母;每题每会话仅可判一次(杜绝枚举四次试出答案)
function handleQuizJudge(req, res) {
  readBody(req, obj => {
    const s = quizSessions.get(obj.sessionId);
    if (!s) { sendJson(res, 400, { error: '会话不存在或已提交,请重新出卷' }); return; }
    const i = parseInt(obj.qIndex, 10);
    const letter = String(obj.letter || '');
    if (!(i >= 0 && i < s.mc.length) || !['A', 'B', 'C', 'D'].includes(letter)) { sendJson(res, 400, { error: '参数不合法' }); return; }
    if (!s.judged) s.judged = {};
    if (s.judged[i] !== undefined) { sendJson(res, 409, { error: '该题已批改,不能改判' }); return; }
    s.judged[i] = letter;
    const out = { right: letter === s.mc[i].correctLetter };
    // 神话卷特批:判后公开正解与解析(仅此卷,文理卷仍守"正解不出服务器")
    if (s.track === 'shen') { out.correctLetter = s.mc[i].correctLetter; out.explain = s.mc[i].explain || ''; }
    sendJson(res, 200, out);
  });
}

function query2track(t) { return t === 'li' || t === 'wen' || t === 'shen' ? t : ''; }

// POST /api/quiz/invite:接受「特别邀请函」→ 获得进馆权限
// 未达 60 分的访客给第二次机会,接受即通过(与正常通过同等效力;此即文档「镜框回应得慢一些」的那一档)
function handleQuizInvite(req, res) {
  const dk = deviceKey(req);
  if (!gateData.quizPassed) gateData.quizPassed = {};
  gateData.quizPassed[dk] = Date.now();
  saveGateData();
  sendJson(res, 200, { ok: true, passed: true });
}

function handleQuizState(req, res) {
  const dk = deviceKey(req);
  const passed = !!(
    (gateData.quizPassed && gateData.quizPassed[dk]) ||
    (gateData.vipPassed && gateData.vipPassed[dk])
  );
  sendJson(res, 200, { passed, passScore: QUIZ_PASS_SCORE });
}

module.exports = { handleQuizStart, handleQuizSubmit, handleQuizState, handleQuizInvite, handleQuizJudge, QUIZ_PASS_SCORE };
