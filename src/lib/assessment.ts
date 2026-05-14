export type ConstitutionKey =
  | "balanced"
  | "qiDeficiency"
  | "yangDeficiency"
  | "yinDeficiency"
  | "phlegmDampness"
  | "dampHeat"
  | "bloodStasis"
  | "qiStagnation"
  | "specialDiathesis";

export type TongueFeatureKey =
  | "coatingColor"
  | "coatingTexture"
  | "bodyColor"
  | "shape"
  | "tip"
  | "center"
  | "sides";

export type TongueObservation = Record<TongueFeatureKey, string> & {
  capturedAt: string;
};

export type TongueCapture = {
  dataUrl: string;
  fileName: string;
  width: number;
  height: number;
  sizeKb: number;
  capturedAt: string;
};

export type ConstitutionProfile = {
  key: ConstitutionKey;
  label: string;
  shortLabel: string;
  summary: string;
  careFocus: string;
  morningTip: string;
};

export type ConstitutionResult = {
  primary: ConstitutionProfile;
  secondary: ConstitutionProfile[];
  scores: Array<{ key: ConstitutionKey; label: string; score: number }>;
  completedAt: string;
};

export type QuizQuestion = {
  id: string;
  constitution: ConstitutionKey;
  text: string;
};

export const SCALE = [
  { value: 1, label: "沒有" },
  { value: 2, label: "很少" },
  { value: 3, label: "有時" },
  { value: 4, label: "經常" },
  { value: 5, label: "總是" },
] as const;

export const CONSTITUTIONS: Record<ConstitutionKey, ConstitutionProfile> = {
  balanced: {
    key: "balanced",
    label: "平和質",
    shortLabel: "平和",
    summary: "陰陽氣血相對調和，精神、睡眠、食慾與排便多能維持穩定。",
    careFocus: "維持規律作息、均衡飲食與固定活動，避免長期熬夜或飲食過偏。",
    morningTip: "今日以穩定節律為主，早餐可選溫熱、清淡且有蛋白質的搭配。",
  },
  qiDeficiency: {
    key: "qiDeficiency",
    label: "氣虛質",
    shortLabel: "氣虛",
    summary: "容易疲倦、氣短、自汗或聲音低弱，日常恢復力偏慢。",
    careFocus: "重視補氣健脾，避免過度勞累與長時間空腹。",
    morningTip: "可選山藥粥、南瓜小米粥等溫和食物，今天把行程留一點緩衝。",
  },
  yangDeficiency: {
    key: "yangDeficiency",
    label: "陽虛質",
    shortLabel: "陽虛",
    summary: "怕冷、手足不溫，腹部或腰膝容易覺得冷，偏好熱飲熱食。",
    careFocus: "以溫陽護脾腎為主，少冰飲、生冷瓜果與長時間受寒。",
    morningTip: "早晨可用薑棗茶或溫熱早餐暖胃，外出注意腹部與足部保暖。",
  },
  yinDeficiency: {
    key: "yinDeficiency",
    label: "陰虛質",
    shortLabel: "陰虛",
    summary: "容易口乾、手足心熱、午後潮熱或睡眠偏淺。",
    careFocus: "宜養陰潤燥，減少熬夜、辛辣燥烈與過量咖啡因。",
    morningTip: "可選百合、銀耳、梨水等潤燥選項，今天把睡眠排在優先順位。",
  },
  phlegmDampness: {
    key: "phlegmDampness",
    label: "痰濕質",
    shortLabel: "痰濕",
    summary: "常見身重困倦、胸悶、痰多、腹部脹滿或舌苔偏厚膩。",
    careFocus: "重在健脾化濕，飲食清淡，少甜膩、油炸與久坐。",
    morningTip: "可選薏仁、茯苓、陳皮等清爽搭配，飯後安排輕快步行。",
  },
  dampHeat: {
    key: "dampHeat",
    label: "濕熱質",
    shortLabel: "濕熱",
    summary: "容易口苦、口黏、痘疹、尿色偏黃或大便黏滯。",
    careFocus: "宜清淡利濕，少酒、少辣、少油炸，避免悶熱環境久待。",
    morningTip: "今日飲食走清爽路線，可用冬瓜、赤小豆、薏仁等溫和食材。",
  },
  bloodStasis: {
    key: "bloodStasis",
    label: "血瘀質",
    shortLabel: "血瘀",
    summary: "面色或唇色偏暗，身體局部刺痛、瘀青不易散或舌質紫暗。",
    careFocus: "重視規律活動、溫和伸展與情緒舒展，避免久坐久臥。",
    morningTip: "今天安排 20 分鐘散步或伸展，可搭配玫瑰花茶作為日常調養參考。",
  },
  qiStagnation: {
    key: "qiStagnation",
    label: "氣鬱質",
    shortLabel: "氣鬱",
    summary: "容易胸悶、嘆氣、緊繃、睡不踏實，情緒受壓力影響較明顯。",
    careFocus: "宜疏肝理氣，保留放鬆時間，避免長期壓抑情緒。",
    morningTip: "可用玫瑰、佛手或陳皮作日常茶飲參考，今天先處理最重要的一件事。",
  },
  specialDiathesis: {
    key: "specialDiathesis",
    label: "特稟質",
    shortLabel: "特稟",
    summary: "對花粉、食物、氣候或環境變化較敏感，容易出現過敏相關不適。",
    careFocus: "重視避開誘發因子、規律記錄反應，急性或嚴重過敏需立即就醫。",
    morningTip: "外出前留意空氣與環境變化，飲食維持簡單，避免嘗試未知刺激物。",
  },
};

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  { id: "balanced-energy", constitution: "balanced", text: "近三個月，您的精神與體力大致穩定嗎？" },
  {
    id: "balanced-sleep",
    constitution: "balanced",
    text: "近三個月，您的睡眠醒來後多半覺得恢復嗎？",
  },
  {
    id: "balanced-appetite",
    constitution: "balanced",
    text: "近三個月，您的食慾、排便與日常節律大致規律嗎？",
  },
  { id: "qi-tired", constitution: "qiDeficiency", text: "您是否容易疲乏，稍微活動就想休息？" },
  { id: "qi-breath", constitution: "qiDeficiency", text: "您是否容易氣短、懶得說話或聲音偏低？" },
  { id: "qi-sweat", constitution: "qiDeficiency", text: "您是否在不熱或活動不多時也容易出汗？" },
  {
    id: "yang-cold",
    constitution: "yangDeficiency",
    text: "您是否手腳發涼、怕冷，尤其腹部或腰膝怕冷？",
  },
  {
    id: "yang-drink",
    constitution: "yangDeficiency",
    text: "您是否明顯偏好熱飲熱食，吃生冷後不舒服？",
  },
  {
    id: "yang-stool",
    constitution: "yangDeficiency",
    text: "您是否常有大便偏稀、清晨腹部不適或精神怕冷的感覺？",
  },
  { id: "yin-dry", constitution: "yinDeficiency", text: "您是否常覺得口乾、咽乾或皮膚偏乾？" },
  {
    id: "yin-heat",
    constitution: "yinDeficiency",
    text: "您是否午後或夜間容易覺得燥熱、手足心熱？",
  },
  {
    id: "yin-sleep",
    constitution: "yinDeficiency",
    text: "您是否睡眠偏淺、多夢，或熬夜後特別燥？",
  },
  {
    id: "phlegm-heavy",
    constitution: "phlegmDampness",
    text: "您是否常覺得身體沉重、頭腦昏沉或胸悶？",
  },
  {
    id: "phlegm-coating",
    constitution: "phlegmDampness",
    text: "您是否常覺得口中黏膩、痰多，或舌苔看起來厚膩？",
  },
  {
    id: "phlegm-full",
    constitution: "phlegmDampness",
    text: "您是否飯後容易腹脹、困倦，或偏好甜膩食物？",
  },
  {
    id: "damp-heat-mouth",
    constitution: "dampHeat",
    text: "您是否容易口苦、口黏、口氣重或想喝冰涼飲品？",
  },
  {
    id: "damp-heat-skin",
    constitution: "dampHeat",
    text: "您是否容易長痘、皮膚油膩或身體有悶熱感？",
  },
  {
    id: "damp-heat-stool",
    constitution: "dampHeat",
    text: "您是否尿色偏黃、大便黏滯或排便後仍不清爽？",
  },
  { id: "stasis-color", constitution: "bloodStasis", text: "您的唇色、面色或眼下是否容易偏暗？" },
  {
    id: "stasis-pain",
    constitution: "bloodStasis",
    text: "您是否容易有固定位置的刺痛、瘀青或經絡緊繃？",
  },
  {
    id: "stasis-tongue",
    constitution: "bloodStasis",
    text: "您是否曾留意到舌下脈絡明顯、舌質偏紫暗？",
  },
  {
    id: "stagnation-mood",
    constitution: "qiStagnation",
    text: "您是否容易胸悶、嘆氣、焦躁或情緒鬱悶？",
  },
  {
    id: "stagnation-sleep",
    constitution: "qiStagnation",
    text: "您是否壓力一大就睡不好、胃口改變或肩頸緊？",
  },
  {
    id: "stagnation-throat",
    constitution: "qiStagnation",
    text: "您是否偶爾覺得喉中有堵塞感，吞不下也吐不出？",
  },
  {
    id: "special-nose",
    constitution: "specialDiathesis",
    text: "您是否容易鼻癢、打噴嚏、皮膚癢或對環境變化敏感？",
  },
  {
    id: "special-food",
    constitution: "specialDiathesis",
    text: "您是否曾對特定食物、藥物或氣味有明顯不適反應？",
  },
  {
    id: "special-season",
    constitution: "specialDiathesis",
    text: "換季、花粉、灰塵或冷熱變化時，您是否容易出現不適？",
  },
];

const pathologicKeys = Object.keys(CONSTITUTIONS).filter(
  (key) => key !== "balanced",
) as ConstitutionKey[];

export function calculateConstitution(answers: Record<string, number>): ConstitutionResult {
  const totals = Object.fromEntries(
    Object.keys(CONSTITUTIONS).map((key) => [key, { total: 0, count: 0 }]),
  ) as Record<ConstitutionKey, { total: number; count: number }>;

  QUIZ_QUESTIONS.forEach((question) => {
    const value = answers[question.id];
    if (!value) return;
    totals[question.constitution].total += value;
    totals[question.constitution].count += 1;
  });

  const scores = (Object.keys(CONSTITUTIONS) as ConstitutionKey[])
    .map((key) => {
      const { total, count } = totals[key];
      return {
        key,
        label: CONSTITUTIONS[key].label,
        score: count ? Math.round((total / count) * 20) : 0,
      };
    })
    .sort((a, b) => b.score - a.score);

  const strongestPathologic = pathologicKeys
    .map((key) => scores.find((score) => score.key === key)!)
    .sort((a, b) => b.score - a.score)[0];

  const balancedScore = scores.find((score) => score.key === "balanced")?.score ?? 0;
  const primaryKey =
    balancedScore >= 72 && strongestPathologic.score < 58
      ? "balanced"
      : strongestPathologic.score >= 45
        ? strongestPathologic.key
        : "balanced";

  const secondary = scores
    .filter((score) => score.key !== primaryKey && score.key !== "balanced" && score.score >= 56)
    .slice(0, 2)
    .map((score) => CONSTITUTIONS[score.key]);

  return {
    primary: CONSTITUTIONS[primaryKey],
    secondary,
    scores,
    completedAt: new Date().toISOString(),
  };
}

export const TONGUE_OPTIONS: Record<
  TongueFeatureKey,
  { label: string; options: Array<{ value: string; label: string }> }
> = {
  coatingColor: {
    label: "苔色",
    options: [
      { value: "thinWhite", label: "薄白" },
      { value: "whiteThick", label: "白厚" },
      { value: "yellow", label: "偏黃" },
      { value: "yellowGreasy", label: "黃膩" },
      { value: "peeled", label: "少苔/剝苔" },
    ],
  },
  coatingTexture: {
    label: "苔質",
    options: [
      { value: "thin", label: "薄" },
      { value: "thick", label: "厚" },
      { value: "greasy", label: "膩" },
      { value: "dry", label: "乾" },
      { value: "none", label: "少苔" },
    ],
  },
  bodyColor: {
    label: "舌質",
    options: [
      { value: "lightRed", label: "淡紅" },
      { value: "pale", label: "偏淡" },
      { value: "red", label: "偏紅" },
      { value: "darkPurple", label: "紫暗" },
    ],
  },
  shape: {
    label: "舌形",
    options: [
      { value: "normal", label: "平整" },
      { value: "teethMarks", label: "齒痕" },
      { value: "swollen", label: "胖大" },
      { value: "cracked", label: "裂紋" },
      { value: "thin", label: "瘦薄" },
    ],
  },
  tip: {
    label: "舌尖",
    options: [
      { value: "normal", label: "平和" },
      { value: "red", label: "偏紅" },
      { value: "spots", label: "紅點" },
    ],
  },
  center: {
    label: "舌中",
    options: [
      { value: "normal", label: "平和" },
      { value: "greasy", label: "中部偏膩" },
      { value: "red", label: "中部偏紅" },
      { value: "pale", label: "中部偏淡" },
      { value: "cracked", label: "中部裂紋" },
    ],
  },
  sides: {
    label: "舌邊",
    options: [
      { value: "normal", label: "平和" },
      { value: "red", label: "偏紅" },
      { value: "purple", label: "偏紫" },
    ],
  },
};

export function defaultTongueObservation(result: ConstitutionResult | null): TongueObservation {
  const key = result?.primary.key;
  const base: TongueObservation = {
    coatingColor: "thinWhite",
    coatingTexture: "thin",
    bodyColor: "lightRed",
    shape: "normal",
    tip: "normal",
    center: "normal",
    sides: "normal",
    capturedAt: new Date().toISOString(),
  };

  if (key === "qiDeficiency") return { ...base, bodyColor: "pale", shape: "teethMarks" };
  if (key === "yangDeficiency") return { ...base, bodyColor: "pale", coatingColor: "whiteThick" };
  if (key === "yinDeficiency")
    return { ...base, bodyColor: "red", coatingTexture: "dry", coatingColor: "peeled" };
  if (key === "phlegmDampness")
    return { ...base, coatingColor: "whiteThick", coatingTexture: "greasy", shape: "swollen" };
  if (key === "dampHeat")
    return { ...base, coatingColor: "yellowGreasy", coatingTexture: "greasy", bodyColor: "red" };
  if (key === "bloodStasis") return { ...base, bodyColor: "darkPurple", sides: "purple" };
  if (key === "qiStagnation") return { ...base, sides: "red" };
  if (key === "specialDiathesis") return { ...base, coatingTexture: "thin" };
  return base;
}

function optionLabel(feature: TongueFeatureKey, value: string) {
  return TONGUE_OPTIONS[feature].options.find((option) => option.value === value)?.label ?? value;
}

export function buildTongueReport(
  observation: TongueObservation,
  result: ConstitutionResult | null,
) {
  const findings: Array<{
    label: string;
    value: string;
    note: string;
    level: "stable" | "attention" | "caution";
  }> = [
    {
      label: "苔色",
      value: optionLabel("coatingColor", observation.coatingColor),
      note:
        observation.coatingColor === "yellowGreasy"
          ? "偏向濕熱或飲食厚味後的反應"
          : observation.coatingColor === "yellow"
            ? "可與胃腸積熱、飲食厚味或近日熬夜同看"
            : observation.coatingColor === "whiteThick"
              ? "可見寒濕、痰濕或脾胃運化偏弱線索"
              : observation.coatingColor === "peeled"
                ? "需留意津液不足或胃陰偏弱"
                : "目前偏平穩",
      level:
        observation.coatingColor === "thinWhite"
          ? "stable"
          : observation.coatingColor === "yellowGreasy" || observation.coatingColor === "peeled"
            ? "caution"
            : "attention",
    },
    {
      label: "舌質",
      value: optionLabel("bodyColor", observation.bodyColor),
      note:
        observation.bodyColor === "pale"
          ? "可與氣血不足、陽氣偏弱或脾虛同看"
          : observation.bodyColor === "red"
            ? "可與火熱、陰虛或熬夜後燥熱同看"
            : observation.bodyColor === "darkPurple"
              ? "需留意氣血瘀滯，若伴胸痛麻木應盡快就醫"
              : "淡紅多屬較穩定表現",
      level:
        observation.bodyColor === "lightRed"
          ? "stable"
          : observation.bodyColor === "darkPurple"
            ? "caution"
            : "attention",
    },
    {
      label: "苔質",
      value: optionLabel("coatingTexture", observation.coatingTexture),
      note:
        observation.coatingTexture === "greasy"
          ? "質膩常作為濕濁或痰濕參考線索"
          : observation.coatingTexture === "dry" || observation.coatingTexture === "none"
            ? "乾少需留意津液不足與睡眠、飲水狀態"
            : observation.coatingTexture === "thick"
              ? "厚苔常與飲食積滯或濕濁同看"
              : "薄苔偏平穩",
      level: observation.coatingTexture === "thin" ? "stable" : "attention",
    },
    {
      label: "舌形",
      value: optionLabel("shape", observation.shape),
      note:
        observation.shape === "teethMarks"
          ? "齒痕多與脾氣偏虛、濕重同看"
          : observation.shape === "swollen"
            ? "胖大常與水濕停留、運化偏弱同看"
            : observation.shape === "cracked"
              ? "裂紋需結合乾燥、睡眠與飲水狀態觀察"
              : observation.shape === "thin"
                ? "瘦薄可與陰血不足同看"
                : "舌形暫無明顯偏性",
      level: observation.shape === "normal" ? "stable" : "attention",
    },
    {
      label: "舌尖",
      value: optionLabel("tip", observation.tip),
      note:
        observation.tip === "red" || observation.tip === "spots"
          ? "舌尖偏紅常作為心火偏旺、熬夜或壓力偏高的參考"
          : "舌尖暫無明顯偏紅",
      level: observation.tip === "normal" ? "stable" : "attention",
    },
    {
      label: "舌中",
      value: optionLabel("center", observation.center),
      note:
        observation.center === "greasy"
          ? "舌中偏膩常與脾胃運化、濕濁或飲食積滯同看"
          : observation.center === "red"
            ? "舌中偏紅需留意胃熱、口乾口氣或辛辣厚味累積"
            : observation.center === "pale"
              ? "舌中偏淡可與脾胃氣弱、食後疲倦同看"
              : observation.center === "cracked"
                ? "舌中裂紋需結合口乾、胃部不適與睡眠狀態觀察"
                : "舌中暫無明顯偏性",
      level:
        observation.center === "normal"
          ? "stable"
          : observation.center === "red"
            ? "caution"
            : "attention",
    },
    {
      label: "舌邊",
      value: optionLabel("sides", observation.sides),
      note:
        observation.sides === "red"
          ? "舌邊偏紅可與肝膽鬱熱、壓力或睡眠不足同看"
          : observation.sides === "purple"
            ? "舌邊偏紫需留意氣滯血瘀與循環狀態"
            : "舌邊暫無明顯偏性",
      level:
        observation.sides === "normal"
          ? "stable"
          : observation.sides === "purple"
            ? "caution"
            : "attention",
    },
  ];

  const patternTags = new Set<string>();
  if (observation.tip !== "normal") patternTags.add("心火偏旺");
  if (observation.sides === "red") patternTags.add("肝膽鬱熱");
  if (observation.sides === "purple" || observation.bodyColor === "darkPurple")
    patternTags.add("氣血瘀滯");
  if (observation.center === "greasy" || observation.center === "pale")
    patternTags.add("脾胃運化偏弱");
  if (observation.center === "red") patternTags.add("胃熱偏盛");
  if (observation.shape === "teethMarks" || observation.shape === "swollen")
    patternTags.add("脾虛濕困");
  if (observation.coatingTexture === "greasy" || observation.coatingColor === "whiteThick")
    patternTags.add("痰濕偏重");
  if (observation.coatingColor === "yellowGreasy" || observation.coatingColor === "yellow")
    patternTags.add("濕熱偏重");
  if (
    observation.coatingTexture === "dry" ||
    observation.coatingColor === "peeled" ||
    observation.center === "cracked"
  )
    patternTags.add("津液偏少");
  if (patternTags.size === 0)
    patternTags.add(result?.primary.shortLabel ? `${result.primary.shortLabel}調養` : "平穩觀察");

  const foods = new Set<string>();
  const drinks = new Set<string>();
  const avoid = new Set<string>();
  const routines = new Set<string>();
  const watches = new Set<string>();

  const primary = result?.primary.key;
  if (
    primary === "qiDeficiency" ||
    patternTags.has("脾虛濕困") ||
    patternTags.has("脾胃運化偏弱")
  ) {
    ["山藥粥", "南瓜小米", "四神湯"].forEach((item) => foods.add(item));
    ["黃耆紅棗茶"].forEach((item) => drinks.add(item));
    ["久坐不動", "過度勞累"].forEach((item) => avoid.add(item));
  }
  if (primary === "yangDeficiency") {
    ["溫熱熟食", "薑絲蔬菜湯"].forEach((item) => foods.add(item));
    ["生薑紅棗茶"].forEach((item) => drinks.add(item));
    ["冰飲", "生冷瓜果"].forEach((item) => avoid.add(item));
  }
  if (primary === "yinDeficiency" || patternTags.has("津液偏少")) {
    ["百合蓮子", "銀耳梨水"].forEach((item) => foods.add(item));
    ["麥冬玉竹茶"].forEach((item) => drinks.add(item));
    ["熬夜", "辛辣燒烤"].forEach((item) => avoid.add(item));
  }
  if (primary === "phlegmDampness" || patternTags.has("痰濕偏重")) {
    ["薏仁赤小豆", "茯苓山藥"].forEach((item) => foods.add(item));
    ["陳皮普洱"].forEach((item) => drinks.add(item));
    ["甜膩點心", "油炸食物"].forEach((item) => avoid.add(item));
  }
  if (primary === "dampHeat" || patternTags.has("濕熱偏重")) {
    ["冬瓜湯", "綠豆薏仁"].forEach((item) => foods.add(item));
    ["淡竹葉茶"].forEach((item) => drinks.add(item));
    ["酒精", "重辣重油"].forEach((item) => avoid.add(item));
  }
  if (primary === "bloodStasis" || patternTags.has("氣血瘀滯")) {
    ["黑木耳", "洋蔥熟食"].forEach((item) => foods.add(item));
    ["玫瑰花茶"].forEach((item) => drinks.add(item));
    ["久坐", "熬夜後劇烈運動"].forEach((item) => avoid.add(item));
  }
  if (primary === "qiStagnation" || patternTags.has("肝膽鬱熱")) {
    ["深綠色蔬菜", "清爽熟食"].forEach((item) => foods.add(item));
    ["玫瑰佛手茶", "陳皮茶"].forEach((item) => drinks.add(item));
    ["連續高壓工作", "情緒壓抑"].forEach((item) => avoid.add(item));
  }
  if (patternTags.has("心火偏旺")) {
    ["蓮子百合湯"].forEach((item) => foods.add(item));
    ["蓮子心茶"].forEach((item) => drinks.add(item));
    ["晚間咖啡因", "睡前滑手機過久"].forEach((item) => avoid.add(item));
  }
  if (patternTags.has("胃熱偏盛")) {
    ["清蒸蔬菜", "白蘿蔔湯"].forEach((item) => foods.add(item));
    ["麥冬茶"].forEach((item) => drinks.add(item));
    ["宵夜", "重辣煎炸"].forEach((item) => avoid.add(item));
  }

  if (foods.size === 0) ["溫熱早餐", "深色蔬菜", "足量蛋白質"].forEach((item) => foods.add(item));
  if (drinks.size === 0) ["溫開水", "淡茶"].forEach((item) => drinks.add(item));
  if (avoid.size === 0) ["冰飲", "暴飲暴食", "連續熬夜"].forEach((item) => avoid.add(item));

  routines.add("晚餐七分飽，睡前 2 小時避免大量進食");
  routines.add("午後或晚飯後步行 15-20 分鐘");
  if (patternTags.has("脾虛濕困")) routines.add("腹部注意保暖，少坐少躺，讓身體微微出汗即可");
  if (patternTags.has("脾胃運化偏弱"))
    routines.add("早餐與午餐維持溫熱定時，先減少甜膩與過量奶製品");
  if (patternTags.has("心火偏旺")) routines.add("今晚提早 30 分鐘收心，減少刺激性內容與咖啡因");
  if (patternTags.has("肝膽鬱熱")) routines.add("安排伸展、吐納或短暫戶外散步，先把壓力降下來");

  if (observation.bodyColor === "darkPurple")
    watches.add("若同時出現胸痛、呼吸不順、單側麻木或劇烈頭痛，請立即就醫");
  if (
    observation.coatingColor === "peeled" ||
    observation.coatingTexture === "dry" ||
    observation.center === "cracked"
  )
    watches.add("若口乾、消瘦、發熱或睡眠惡化持續一週以上，建議諮詢專業醫師");
  if (observation.tip === "spots") watches.add("若口舌破潰、疼痛或反覆發炎，建議由醫師評估");
  if (watches.size === 0) watches.add("若不適症狀持續、加重或影響生活，請尋求合格醫療人員協助");

  return {
    findings,
    patternTags: Array.from(patternTags),
    foods: Array.from(foods).slice(0, 4),
    drinks: Array.from(drinks).slice(0, 3),
    avoid: Array.from(avoid).slice(0, 4),
    routines: Array.from(routines).slice(0, 4),
    watches: Array.from(watches).slice(0, 3),
  };
}
