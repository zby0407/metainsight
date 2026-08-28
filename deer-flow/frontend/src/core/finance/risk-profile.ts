import { accountStorageKey } from "@/core/auth/account-storage";
import type { Locale } from "@/core/i18n";

export const RISK_PROFILE_STORAGE_SUFFIX = "risk.profile.v1";
export const RISK_PROFILE_PATH = "/workspace/risk-profile";
export const RISK_PROFILE_VERSION = 1;

export const RISK_PROFILE_IDS = [
  "conservative",
  "steady",
  "balanced",
  "growth",
  "aggressive",
] as const;

export type RiskProfileId = (typeof RISK_PROFILE_IDS)[number];
export type RiskProfileLocale = Extract<Locale, "zh-CN" | "en-US">;

type LocalizedText = Record<RiskProfileLocale, string>;

export interface RiskQuestionOption {
  id: string;
  score: number;
  label: LocalizedText;
}

export interface RiskQuestion {
  id: string;
  dimension: LocalizedText;
  title: LocalizedText;
  basis: LocalizedText;
  options: RiskQuestionOption[];
}

export interface RiskProfileRecord {
  version: number;
  completedAt: string;
  answers: Record<string, string>;
  score: number;
  minScore: number;
  maxScore: number;
  profileId: RiskProfileId;
}

export interface RiskProfileConclusion {
  profileId: RiskProfileId;
  rating: string;
  title: string;
  summary: string;
  horizon: string;
  objective: string;
  suitable: string[];
  unsuitable: string[];
  minCashWeight: string;
  maxSingleWeight: string;
  changeBasis: string[];
}

const FRAMEWORK: LocalizedText[] = [
  {
    "zh-CN":
      "《证券期货投资者适当性管理办法》（证监会令第130号）第六条：经营机构应当了解投资者的投资目标、投资期限、风险偏好、风险承受能力和流动性需求。",
    "en-US":
      "CSRC Measures for the Suitability of Securities and Futures Investors (Order No. 130), Article 6: firms must understand objectives, horizon, risk preference, risk capacity, and liquidity needs.",
  },
  {
    "zh-CN":
      "中国证券投资基金业协会公募基金投资者风险测评问卷的常用维度：年龄与财务状况、投资经验、期限、可接受亏损、市场下跌时的行为。测评结果按 C1–C5 与产品风险等级 R1–R5 匹配。",
    "en-US":
      "AMAC public-fund risk questionnaires typically cover age and finances, experience, horizon, acceptable loss, and drawdown behavior, then map C1–C5 investor types to R1–R5 product risk ratings.",
  },
  {
    "zh-CN":
      "Grable & Lytton（1999）《Financial risk tolerance revisited》将风险容忍度分解为投资知识、时间期限与损失厌恶；CFA Institute 进一步区分风险承受能力（capacity）与风险意愿（willingness）。",
    "en-US":
      "Grable & Lytton (1999) treat knowledge, time horizon, and loss aversion as core risk-tolerance factors; CFA Institute separates risk capacity from risk willingness.",
  },
];

export const RISK_PROFILE_QUESTIONS: RiskQuestion[] = [
  {
    id: "age",
    dimension: { "zh-CN": "风险承受能力", "en-US": "Risk capacity" },
    title: {
      "zh-CN": "您目前的年龄段是？",
      "en-US": "Which age range are you in?",
    },
    basis: {
      "zh-CN":
        "依据《适当性管理办法》对投资者基本情况的了解要求。剩余投资年限越长，理论上可承受波动的能力越高。",
      "en-US":
        "Suitability rules require basic investor information. A longer remaining investment horizon generally supports higher capacity for volatility.",
    },
    options: [
      {
        id: "age-60",
        score: 1,
        label: { "zh-CN": "60 岁及以上", "en-US": "60 or above" },
      },
      {
        id: "age-50",
        score: 2,
        label: { "zh-CN": "50–59 岁", "en-US": "50–59" },
      },
      {
        id: "age-40",
        score: 3,
        label: { "zh-CN": "40–49 岁", "en-US": "40–49" },
      },
      {
        id: "age-30",
        score: 4,
        label: { "zh-CN": "30–39 岁", "en-US": "30–39" },
      },
      {
        id: "age-18",
        score: 5,
        label: { "zh-CN": "18–29 岁", "en-US": "18–29" },
      },
    ],
  },
  {
    id: "experience",
    dimension: { "zh-CN": "投资知识与经验", "en-US": "Knowledge and experience" },
    title: {
      "zh-CN": "您过往的投资经验更接近哪一类？",
      "en-US": "Which description best matches your investment experience?",
    },
    basis: {
      "zh-CN":
        "依据适当性管理对投资经历、品种认知的了解要求；Grable & Lytton（1999）也将投资知识作为风险容忍度的显著因子。",
      "en-US":
        "Suitability rules require knowledge of the investor’s experience. Grable & Lytton (1999) also treat investment knowledge as a significant risk-tolerance factor.",
    },
    options: [
      {
        id: "exp-none",
        score: 1,
        label: {
          "zh-CN": "几乎没有投资经验",
          "en-US": "Little to no investment experience",
        },
      },
      {
        id: "exp-cash",
        score: 2,
        label: {
          "zh-CN": "主要买过货币基金或银行理财",
          "en-US": "Mostly money-market funds or bank wealth products",
        },
      },
      {
        id: "exp-bond",
        score: 3,
        label: {
          "zh-CN": "买过债券基金或偏债混合产品",
          "en-US": "Bond funds or conservative mixed funds",
        },
      },
      {
        id: "exp-equity",
        score: 4,
        label: {
          "zh-CN": "有股票或偏股基金投资经验",
          "en-US": "Stocks or equity-oriented funds",
        },
      },
      {
        id: "exp-advanced",
        score: 5,
        label: {
          "zh-CN": "有多年股票、基金或衍生品交易经验",
          "en-US": "Multi-year stock, fund, or derivatives experience",
        },
      },
    ],
  },
  {
    id: "horizon",
    dimension: { "zh-CN": "投资期限", "en-US": "Investment horizon" },
    title: {
      "zh-CN": "这笔资金预计可以投资多长时间？",
      "en-US": "How long can this capital stay invested?",
    },
    basis: {
      "zh-CN":
        "依据《适当性管理办法》第六条“投资期限”。期限越短，越应降低回撤暴露，以免被迫在亏损时变现。",
      "en-US":
        "Article 6 of the suitability measures requires an investment horizon. A shorter horizon argues for lower drawdown exposure to avoid forced selling.",
    },
    options: [
      {
        id: "hz-1",
        score: 1,
        label: { "zh-CN": "1 年以内", "en-US": "Less than 1 year" },
      },
      {
        id: "hz-3",
        score: 2,
        label: { "zh-CN": "1–3 年", "en-US": "1–3 years" },
      },
      {
        id: "hz-5",
        score: 3,
        label: { "zh-CN": "3–5 年", "en-US": "3–5 years" },
      },
      {
        id: "hz-10",
        score: 4,
        label: { "zh-CN": "5–10 年", "en-US": "5–10 years" },
      },
      {
        id: "hz-10p",
        score: 5,
        label: { "zh-CN": "10 年以上", "en-US": "More than 10 years" },
      },
    ],
  },
  {
    id: "allocation",
    dimension: { "zh-CN": "财务状况", "en-US": "Financial situation" },
    title: {
      "zh-CN": "可用于投资的资金大约占您家庭流动性资产的多少？",
      "en-US": "About what share of household liquid assets can be invested?",
    },
    basis: {
      "zh-CN":
        "依据适当性管理对财务状况的了解要求。占流动资产比例越高，组合波动对家庭流动性的冲击越大，需要更审慎的仓位约束。",
      "en-US":
        "Suitability rules require an understanding of finances. A larger share of liquid assets at risk increases the household impact of volatility.",
    },
    options: [
      {
        id: "alloc-10",
        score: 1,
        label: { "zh-CN": "不超过 10%", "en-US": "No more than 10%" },
      },
      {
        id: "alloc-30",
        score: 2,
        label: { "zh-CN": "10%–30%", "en-US": "10%–30%" },
      },
      {
        id: "alloc-50",
        score: 3,
        label: { "zh-CN": "30%–50%", "en-US": "30%–50%" },
      },
      {
        id: "alloc-70",
        score: 4,
        label: { "zh-CN": "50%–70%", "en-US": "50%–70%" },
      },
      {
        id: "alloc-70p",
        score: 5,
        label: { "zh-CN": "70% 以上", "en-US": "More than 70%" },
      },
    ],
  },
  {
    id: "max-loss",
    dimension: { "zh-CN": "可接受亏损", "en-US": "Acceptable loss" },
    title: {
      "zh-CN": "在一年内，您最多可以接受投资本金亏损多少？",
      "en-US": "What is the largest one-year principal loss you could accept?",
    },
    basis: {
      "zh-CN":
        "基金业协会风险测评问卷的核心题项，用于将投资者类型与产品风险等级 R1–R5 对应，避免把高波动资产匹配给低亏损容忍度的投资者。",
      "en-US":
        "A core AMAC questionnaire item used to map investor type to product risk ratings R1–R5, so high-volatility assets are not matched to low loss tolerance.",
    },
    options: [
      {
        id: "loss-0",
        score: 1,
        label: {
          "zh-CN": "几乎不能接受本金亏损",
          "en-US": "Almost no principal loss",
        },
      },
      {
        id: "loss-5",
        score: 2,
        label: { "zh-CN": "不超过 5%", "en-US": "No more than 5%" },
      },
      {
        id: "loss-15",
        score: 3,
        label: { "zh-CN": "不超过 15%", "en-US": "No more than 15%" },
      },
      {
        id: "loss-25",
        score: 4,
        label: { "zh-CN": "不超过 25%", "en-US": "No more than 25%" },
      },
      {
        id: "loss-25p",
        score: 5,
        label: {
          "zh-CN": "可以接受 25% 以上的亏损",
          "en-US": "More than 25% is acceptable",
        },
      },
    ],
  },
  {
    id: "drawdown",
    dimension: { "zh-CN": "风险意愿", "en-US": "Risk willingness" },
    title: {
      "zh-CN": "如果组合在三个月内回撤约 20%，您更可能怎么做？",
      "en-US": "If the portfolio fell about 20% in three months, what would you most likely do?",
    },
    basis: {
      "zh-CN":
        "依据适当性管理中的“风险偏好”，并对应 Grable & Lytton 量表中的行为题。它衡量意愿而非能力：同样财务条件下，行为反应仍可能显著不同。",
      "en-US":
        "This captures risk preference under the suitability rules and the behavioral items in Grable & Lytton. It measures willingness, not capacity: reactions can differ even with similar finances.",
    },
    options: [
      {
        id: "dd-exit",
        score: 1,
        label: { "zh-CN": "立即全部卖出", "en-US": "Sell everything immediately" },
      },
      {
        id: "dd-cut",
        score: 2,
        label: {
          "zh-CN": "卖出大部分，明显降低风险",
          "en-US": "Sell most of it and cut risk sharply",
        },
      },
      {
        id: "dd-hold",
        score: 3,
        label: { "zh-CN": "先观望，暂不操作", "en-US": "Wait and take no action yet" },
      },
      {
        id: "dd-add",
        score: 4,
        label: {
          "zh-CN": "小幅加仓，摊薄成本",
          "en-US": "Add a little to average down",
        },
      },
      {
        id: "dd-buy",
        score: 5,
        label: {
          "zh-CN": "显著加仓，视为配置机会",
          "en-US": "Add substantially and treat it as an opportunity",
        },
      },
    ],
  },
  {
    id: "objective",
    dimension: { "zh-CN": "投资目标", "en-US": "Investment objective" },
    title: {
      "zh-CN": "您更看重哪一类投资目标？",
      "en-US": "Which investment objective matters most to you?",
    },
    basis: {
      "zh-CN":
        "依据《适当性管理办法》第六条“投资目标”。目标收益必须与可接受波动一致，否则后续策略约束会与真实偏好冲突。",
      "en-US":
        "Article 6 requires an investment objective. Target return must be consistent with acceptable volatility, or later strategy constraints will conflict with preference.",
    },
    options: [
      {
        id: "obj-preserve",
        score: 1,
        label: {
          "zh-CN": "保本和流动性优先，跑赢通胀即可",
          "en-US": "Capital preservation and liquidity; beating inflation is enough",
        },
      },
      {
        id: "obj-steady",
        score: 2,
        label: {
          "zh-CN": "稳健增值，波动要尽量小",
          "en-US": "Steady growth with limited volatility",
        },
      },
      {
        id: "obj-balance",
        score: 3,
        label: {
          "zh-CN": "收益与风险大致平衡",
          "en-US": "A balance of return and risk",
        },
      },
      {
        id: "obj-growth",
        score: 4,
        label: {
          "zh-CN": "追求资产较快增长",
          "en-US": "Faster asset growth",
        },
      },
      {
        id: "obj-high",
        score: 5,
        label: {
          "zh-CN": "追求较高收益，可承受大幅波动",
          "en-US": "Higher return and large swings are acceptable",
        },
      },
    ],
  },
  {
    id: "buffer",
    dimension: { "zh-CN": "流动性需求", "en-US": "Liquidity needs" },
    title: {
      "zh-CN": "您的收入稳定性和应急储备更接近哪一项？",
      "en-US": "Which best describes your income stability and emergency reserve?",
    },
    basis: {
      "zh-CN":
        "依据适当性管理对收入来源、流动性需求的了解要求。应急储备不足时，即使主观上愿意承担风险，客观承受能力也应下调。",
      "en-US":
        "Suitability rules require income and liquidity information. A thin emergency reserve lowers objective capacity even if the investor feels willing to take risk.",
    },
    options: [
      {
        id: "buf-none",
        score: 1,
        label: {
          "zh-CN": "收入不稳定，几乎没有应急储备",
          "en-US": "Unstable income and almost no emergency reserve",
        },
      },
      {
        id: "buf-thin",
        score: 2,
        label: {
          "zh-CN": "有少量应急资金，收入一般",
          "en-US": "A small reserve and average income",
        },
      },
      {
        id: "buf-6m",
        score: 3,
        label: {
          "zh-CN": "大约有 6 个月生活费储备",
          "en-US": "About six months of living expenses in reserve",
        },
      },
      {
        id: "buf-stable",
        score: 4,
        label: {
          "zh-CN": "收入稳定，储备比较充足",
          "en-US": "Stable income and a comfortable reserve",
        },
      },
      {
        id: "buf-ample",
        score: 5,
        label: {
          "zh-CN": "财务宽裕，投资亏损不影响生活",
          "en-US": "Finances are ample; investment losses would not affect living costs",
        },
      },
    ],
  },
];

const PROFILE_COPY: Record<
  RiskProfileId,
  {
    rating: string;
    title: LocalizedText;
    summary: LocalizedText;
    horizon: LocalizedText;
    objective: LocalizedText;
    suitable: LocalizedText[];
    unsuitable: LocalizedText[];
    minCashWeight: string;
    maxSingleWeight: string;
  }
> = {
  conservative: {
    rating: "C1",
    title: { "zh-CN": "保守型", "en-US": "Conservative" },
    summary: {
      "zh-CN":
        "您更看重本金安全和流动性，风险承受能力与风险意愿都偏低。后续投研应以低波动资产为主，避免把组合做成高集中度股票仓。",
      "en-US":
        "You prioritize capital safety and liquidity, with both capacity and willingness on the low side. Research should stay in low-volatility assets and avoid concentrated stock bets.",
    },
    horizon: { "zh-CN": "1–3 年", "en-US": "1–3 years" },
    objective: {
      "zh-CN": "本金安全与流动性优先，控制回撤，收益以覆盖通胀为主",
      "en-US": "Prioritize principal safety and liquidity; keep drawdowns contained and aim mainly to cover inflation",
    },
    suitable: [
      { "zh-CN": "货币市场基金、国债及短债（约 R1–R2）", "en-US": "Money-market funds, government and short-duration bonds (about R1–R2)" },
      { "zh-CN": "高流动性现金管理工具", "en-US": "Highly liquid cash-management tools" },
    ],
    unsuitable: [
      { "zh-CN": "高波动个股、主题炒作、杠杆或衍生品", "en-US": "High-volatility stocks, thematic speculation, leverage, or derivatives" },
      { "zh-CN": "单一个股占组合过高", "en-US": "A single stock dominating the portfolio" },
    ],
    minCashWeight: "0.40",
    maxSingleWeight: "0.08",
  },
  steady: {
    rating: "C2",
    title: { "zh-CN": "稳健型", "en-US": "Steady" },
    summary: {
      "zh-CN":
        "您可以接受有限波动，但仍以稳健增值为主。组合应保持足够现金和分散度，股票仓位需要有明确上限。",
      "en-US":
        "You can accept limited volatility but still prefer steady growth. Keep a meaningful cash buffer, stay diversified, and cap single-stock weight.",
    },
    horizon: { "zh-CN": "3–5 年", "en-US": "3–5 years" },
    objective: {
      "zh-CN": "在可接受的小幅回撤下追求稳健增值",
      "en-US": "Seek steady growth within a modest acceptable drawdown",
    },
    suitable: [
      { "zh-CN": "债券基金、偏债混合（约 R2–R3）", "en-US": "Bond funds and conservative mixed funds (about R2–R3)" },
      { "zh-CN": "低波动蓝筹的小仓位配置", "en-US": "A small allocation to lower-volatility blue chips" },
    ],
    unsuitable: [
      { "zh-CN": "高弹性题材股作为核心仓", "en-US": "High-beta thematic stocks as core holdings" },
      { "zh-CN": "短期交易和杠杆工具", "en-US": "Short-term trading and leveraged instruments" },
    ],
    minCashWeight: "0.25",
    maxSingleWeight: "0.12",
  },
  balanced: {
    rating: "C3",
    title: { "zh-CN": "平衡型", "en-US": "Balanced" },
    summary: {
      "zh-CN":
        "您希望收益与风险大致平衡，具备中等承受能力。股债搭配、控制单一个股权重，是后续策略和复盘时应坚持的约束。",
      "en-US":
        "You want a balance of return and risk and have moderate capacity. Pairing equities with defensive assets and capping single-name weight should remain the working constraint.",
    },
    horizon: { "zh-CN": "约 5 年", "en-US": "About 5 years" },
    objective: {
      "zh-CN": "在可接受回撤下追求长期稳健增值，股债权重保持均衡",
      "en-US": "Seek long-term growth within an acceptable drawdown, keeping equity and defensive weights in balance",
    },
    suitable: [
      { "zh-CN": "股债混合、偏股基金与优质龙头（约 R3）", "en-US": "Balanced mixed funds, equity funds, and quality leaders (about R3)" },
      { "zh-CN": "行业适度分散的股票组合", "en-US": "An equity book with reasonable sector diversification" },
    ],
    unsuitable: [
      { "zh-CN": "单一行业或单一个股过度集中", "en-US": "Excess concentration in one sector or one stock" },
      { "zh-CN": "把应急资金投入高波动资产", "en-US": "Putting emergency cash into high-volatility assets" },
    ],
    minCashWeight: "0.15",
    maxSingleWeight: "0.18",
  },
  growth: {
    rating: "C4",
    title: { "zh-CN": "成长型", "en-US": "Growth" },
    summary: {
      "zh-CN":
        "您更看重长期成长，可接受较大波动，但仍需保留现金底仓并限制个股集中度，避免一次回撤摧毁组合纪律。",
      "en-US":
        "You emphasize long-term growth and can accept larger swings, but still need a cash floor and a single-name cap so one drawdown does not break the process.",
    },
    horizon: { "zh-CN": "5–10 年", "en-US": "5–10 years" },
    objective: {
      "zh-CN": "在可接受回撤下追求长期成长，股票仓位可以更高但仍需分散",
      "en-US": "Seek long-term growth within an acceptable drawdown; equity weight may be higher but should stay diversified",
    },
    suitable: [
      { "zh-CN": "偏股基金、成长风格与优质个股（约 R3–R4）", "en-US": "Equity funds, growth styles, and quality stocks (about R3–R4)" },
      { "zh-CN": "中长期持有的行业龙头", "en-US": "Sector leaders held over a medium-to-long horizon" },
    ],
    unsuitable: [
      { "zh-CN": "把大部分净值压在一两只股票上", "en-US": "Putting most of the NAV into one or two stocks" },
      { "zh-CN": "缺乏现金缓冲的满仓杠杆", "en-US": "Fully invested leverage without a cash buffer" },
    ],
    minCashWeight: "0.10",
    maxSingleWeight: "0.22",
  },
  aggressive: {
    rating: "C5",
    title: { "zh-CN": "进取型", "en-US": "Aggressive" },
    summary: {
      "zh-CN":
        "您追求较高收益并能够接受大幅波动，但仍应保留最低现金和个股上限。进取不等于集中下注。",
      "en-US":
        "You seek higher return and can accept large swings, but a minimum cash floor and single-name cap still apply. Aggressive is not the same as concentrated betting.",
    },
    horizon: { "zh-CN": "10 年以上", "en-US": "10+ years" },
    objective: {
      "zh-CN": "追求较高长期收益，接受较大回撤，同时保持最低分散与现金约束",
      "en-US": "Seek higher long-term return, accept larger drawdowns, and keep minimum diversification and cash constraints",
    },
    suitable: [
      { "zh-CN": "股票型基金、成长和主题资产（约 R4–R5）", "en-US": "Equity funds, growth and thematic assets (about R4–R5)" },
      { "zh-CN": "在分散前提下提高权益仓位", "en-US": "A higher equity weight, provided it stays diversified" },
    ],
    unsuitable: [
      { "zh-CN": "无对冲的杠杆和单一标的豪赌", "en-US": "Unhedged leverage and a single-name gamble" },
      { "zh-CN": "把生活备用金当作风险本金", "en-US": "Treating living reserves as risk capital" },
    ],
    minCashWeight: "0.05",
    maxSingleWeight: "0.25",
  },
};

const COPY = {
  eyebrow: { "zh-CN": "首次登录", "en-US": "First login" },
  title: { "zh-CN": "投资人风险偏好测评", "en-US": "Investor risk-preference questionnaire" },
  description: {
    "zh-CN":
      "请用约 3 分钟完成 8 道选择题。题目按监管适当性维度与业界常用问卷设计，结果将作为后续组合约束和投研判断里的投资者偏好依据。",
    "en-US":
      "Please complete eight multiple-choice questions. They follow suitability dimensions and industry questionnaires; the result becomes the investor-preference input for later portfolio constraints and research.",
  },
  start: { "zh-CN": "开始测评", "en-US": "Start" },
  next: { "zh-CN": "下一题", "en-US": "Next" },
  back: { "zh-CN": "上一题", "en-US": "Back" },
  submit: { "zh-CN": "查看结论", "en-US": "See conclusion" },
  stepOf: { "zh-CN": "第 {current} / {total} 题", "en-US": "Question {current} of {total}" },
  questionBasis: { "zh-CN": "本题依据", "en-US": "Basis for this question" },
  frameworkTitle: { "zh-CN": "题目设计依据", "en-US": "Why these questions" },
  conclusionEyebrow: { "zh-CN": "测评结论", "en-US": "Conclusion" },
  conclusionTitle: { "zh-CN": "您的风险偏好类型", "en-US": "Your risk-preference type" },
  scoreLabel: { "zh-CN": "得分", "en-US": "Score" },
  enterWorkspace: { "zh-CN": "进入工作台", "en-US": "Enter workspace" },
  retake: { "zh-CN": "重新测评", "en-US": "Retake" },
  disclaimer: {
    "zh-CN":
      "本测评用于刻画风险偏好并匹配投研约束，不替代持牌机构的法定适当性评估，也不构成投资建议。",
    "en-US":
      "This questionnaire characterizes risk preference for research constraints. It does not replace a licensed firm’s legal suitability assessment and is not investment advice.",
  },
  suitable: { "zh-CN": "更匹配的方向", "en-US": "Better fit" },
  unsuitable: { "zh-CN": "需要避免的方向", "en-US": "Avoid" },
  cashFloor: { "zh-CN": "建议现金底仓", "en-US": "Suggested cash floor" },
  singleCap: { "zh-CN": "建议个股上限", "en-US": "Suggested single-stock cap" },
  matchedRating: { "zh-CN": "适当性等级", "en-US": "Suitability band" },
  constraintHint: {
    "zh-CN":
      "以上约束会写入系统记忆，并作为后续新建组合目标与改仓的硬约束。",
    "en-US":
      "These constraints are saved to system memory and used as hard limits for later portfolio setup and rebalancing.",
  },
  navLabel: { "zh-CN": "风险偏好测评", "en-US": "Risk preference" },
} as const;

export function riskProfileLocale(locale: string | null | undefined): RiskProfileLocale {
  return locale?.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

export function riskProfileText(
  text: LocalizedText,
  locale: string | null | undefined,
): string {
  return text[riskProfileLocale(locale)];
}

export function riskProfileCopy(
  key: keyof typeof COPY,
  locale: string | null | undefined,
  values?: Record<string, string | number>,
): string {
  let source: string = COPY[key][riskProfileLocale(locale)];
  if (!values) return source;
  for (const [name, value] of Object.entries(values)) {
    source = source.replace(`{${name}}`, String(value));
  }
  return source;
}

export function riskProfileFramework(locale: string | null | undefined): string[] {
  return FRAMEWORK.map((item) => riskProfileText(item, locale));
}

export function riskProfileScoreRange() {
  const minScore = RISK_PROFILE_QUESTIONS.reduce(
    (sum, question) => sum + Math.min(...question.options.map((option) => option.score)),
    0,
  );
  const maxScore = RISK_PROFILE_QUESTIONS.reduce(
    (sum, question) => sum + Math.max(...question.options.map((option) => option.score)),
    0,
  );
  return { minScore, maxScore };
}

export function findRiskQuestion(questionId: string): RiskQuestion | undefined {
  return RISK_PROFILE_QUESTIONS.find((question) => question.id === questionId);
}

export function scoreRiskProfile(answers: Record<string, string>): {
  score: number;
  minScore: number;
  maxScore: number;
} {
  const { minScore, maxScore } = riskProfileScoreRange();
  let score = 0;
  for (const question of RISK_PROFILE_QUESTIONS) {
    const optionId = answers[question.id];
    const option = question.options.find((item) => item.id === optionId);
    if (!option) {
      throw new Error(`Missing or invalid answer for ${question.id}`);
    }
    score += option.score;
  }
  return { score, minScore, maxScore };
}

export function profileIdFromScore(score: number): RiskProfileId {
  if (score <= 14) return "conservative";
  if (score <= 21) return "steady";
  if (score <= 28) return "balanced";
  if (score <= 34) return "growth";
  return "aggressive";
}

export function concludeRiskProfile(
  profileId: RiskProfileId,
  locale: string | null | undefined,
): RiskProfileConclusion {
  const copy = PROFILE_COPY[profileId];
  const cashPercent = Math.round(Number(copy.minCashWeight) * 100);
  const singlePercent = Math.round(Number(copy.maxSingleWeight) * 100);
  const isZh = riskProfileLocale(locale) === "zh-CN";
  return {
    profileId,
    rating: copy.rating,
    title: riskProfileText(copy.title, locale),
    summary: riskProfileText(copy.summary, locale),
    horizon: riskProfileText(copy.horizon, locale),
    objective: riskProfileText(copy.objective, locale),
    suitable: copy.suitable.map((item) => riskProfileText(item, locale)),
    unsuitable: copy.unsuitable.map((item) => riskProfileText(item, locale)),
    minCashWeight: copy.minCashWeight,
    maxSingleWeight: copy.maxSingleWeight,
    changeBasis: isZh
      ? [
          `风险测评结论为 ${copy.rating} ${riskProfileText(copy.title, locale)}`,
          `现金底仓不低于 ${cashPercent}%`,
          `单一股票仓位不超过 ${singlePercent}%`,
        ]
      : [
          `Risk questionnaire result: ${copy.rating} ${riskProfileText(copy.title, locale)}`,
          `Keep cash at or above ${cashPercent}%`,
          `Cap any single stock at ${singlePercent}%`,
        ],
  };
}

export function buildRiskProfileRecord(
  answers: Record<string, string>,
  completedAt = new Date().toISOString(),
): RiskProfileRecord {
  const scored = scoreRiskProfile(answers);
  return {
    version: RISK_PROFILE_VERSION,
    completedAt,
    answers: { ...answers },
    score: scored.score,
    minScore: scored.minScore,
    maxScore: scored.maxScore,
    profileId: profileIdFromScore(scored.score),
  };
}

export function isRiskProfileId(value: unknown): value is RiskProfileId {
  return (
    typeof value === "string" &&
    (RISK_PROFILE_IDS as readonly string[]).includes(value)
  );
}

export function parseRiskProfileRecord(value: unknown): RiskProfileRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== RISK_PROFILE_VERSION) return null;
  if (typeof record.completedAt !== "string" || !record.completedAt) return null;
  if (!isRiskProfileId(record.profileId)) return null;
  if (
    typeof record.score !== "number" ||
    typeof record.minScore !== "number" ||
    typeof record.maxScore !== "number"
  ) {
    return null;
  }
  const answers = record.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return null;
  }
  const normalized: Record<string, string> = {};
  for (const [key, optionId] of Object.entries(answers)) {
    if (typeof optionId === "string" && optionId) {
      normalized[key] = optionId;
    }
  }
  try {
    const scored = scoreRiskProfile(normalized);
    return {
      version: RISK_PROFILE_VERSION,
      completedAt: record.completedAt,
      answers: normalized,
      score: scored.score,
      minScore: scored.minScore,
      maxScore: scored.maxScore,
      profileId: profileIdFromScore(scored.score),
    };
  } catch {
    return null;
  }
}

export function riskProfileStorageKey(userId: string): string {
  return accountStorageKey(userId, RISK_PROFILE_STORAGE_SUFFIX);
}

export function readStoredRiskProfile(
  userId: string,
  storage: Pick<Storage, "getItem"> | null | undefined = typeof window === "undefined"
    ? null
    : window.localStorage,
): RiskProfileRecord | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(riskProfileStorageKey(userId));
    if (!raw) return null;
    return parseRiskProfileRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeStoredRiskProfile(
  userId: string,
  record: RiskProfileRecord,
  storage: Pick<Storage, "setItem"> | null | undefined = typeof window === "undefined"
    ? null
    : window.localStorage,
): void {
  if (!storage) return;
  storage.setItem(riskProfileStorageKey(userId), JSON.stringify(record));
}

export function hasCompletedRiskProfile(
  userId: string,
  storage?: Pick<Storage, "getItem"> | null,
): boolean {
  return readStoredRiskProfile(userId, storage) !== null;
}

export function riskProfileStrategyPrefill(
  record: RiskProfileRecord,
  locale: string | null | undefined,
) {
  const conclusion = concludeRiskProfile(record.profileId, locale);
  return {
    objective: conclusion.objective,
    horizon: conclusion.horizon,
    policy: {
      riskProfile: conclusion.profileId,
      riskRating: conclusion.rating,
      minCashWeight: conclusion.minCashWeight,
      maxSingleWeight: conclusion.maxSingleWeight,
      changeBasis: conclusion.changeBasis,
    },
  };
}

export const RISK_PROFILE_MEMORY_MARKER = "[investor-risk-profile]";

export function formatRiskProfilePreference(
  record: RiskProfileRecord,
  locale: string | null | undefined,
): string {
  const conclusion = concludeRiskProfile(record.profileId, locale);
  const cash = Math.round(Number(conclusion.minCashWeight) * 100);
  const single = Math.round(Number(conclusion.maxSingleWeight) * 100);
  if (riskProfileLocale(locale) === "zh-CN") {
    return `${conclusion.rating} ${conclusion.title}（${record.score}/${record.maxScore}）。现金不低于 ${cash}%，单一股票不超过 ${single}%。${conclusion.objective}。`;
  }
  return `${conclusion.rating} ${conclusion.title} (${record.score}/${record.maxScore}). Keep cash at or above ${cash}% and any single stock at or below ${single}%. ${conclusion.objective}.`;
}

export function isRiskProfileMemoryFact(content: string | null | undefined): boolean {
  return typeof content === "string" && content.includes(RISK_PROFILE_MEMORY_MARKER);
}

export function buildRiskProfileMemoryContent(
  record: RiskProfileRecord,
  locale: string | null | undefined,
): string {
  const conclusion = concludeRiskProfile(record.profileId, locale);
  const preference = formatRiskProfilePreference(record, locale);
  const cash = Math.round(Number(conclusion.minCashWeight) * 100);
  const single = Math.round(Number(conclusion.maxSingleWeight) * 100);
  const suitable = conclusion.suitable.join("、");
  const unsuitable = conclusion.unsuitable.join("、");
  if (riskProfileLocale(locale) === "zh-CN") {
    return [
      `${RISK_PROFILE_MEMORY_MARKER} 投资者个人画像：${preference}`,
      `更匹配：${suitable}。需要避免：${unsuitable}。`,
      `改仓硬约束：提出或执行任何加减仓、调仓、策略优化或沙盘落地时，必须核对本画像；不得跌破现金底仓 ${cash}% 或超过单一股票 ${single}%；改仓依据必须引用本画像。`,
    ].join(" ");
  }
  return [
    `${RISK_PROFILE_MEMORY_MARKER} Investor profile: ${preference}`,
    `Better fit: ${suitable}. Avoid: ${unsuitable}.`,
    `Rebalance constraint: before proposing or executing any position change, strategy update, or sandbox rollout, honor this profile; do not breach the ${cash}% cash floor or the ${single}% single-stock cap; cite this profile in the change basis.`,
  ].join(" ");
}
