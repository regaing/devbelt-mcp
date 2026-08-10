/**
 * 单位换算常量表：每类单位以"基准单位"为锚，系数 = 1 基准单位等于多少该单位。
 * 温度等非线性换算走 convert 函数。
 */
export interface UnitCategory {
  /** 中文名 */
  name: string;
  /** 单位 -> 换算系数（value × 系数 = 基准单位值） */
  units: Record<string, number>;
  /** 特殊换算（温度等非线性），覆盖默认算法 */
  convert?: (value: number, from: string, to: string) => number;
  /** 备注 */
  note?: string;
}

export const UNIT_CATEGORIES: Record<string, UnitCategory> = {
  length: {
    name: "长度",
    units: {
      km: 0.001, m: 1, dm: 10, cm: 100, mm: 1000, um: 1e6, nm: 1e9,
      mile: 0.0006213712, yd: 1.0936132983, ft: 3.280839895, inch: 39.37007874,
      nmi: 0.0005399568, li: 0.002, zhang: 0.3, chi: 3, cun: 30,
    },
  },
  area: {
    name: "面积",
    units: {
      km2: 0.000001, m2: 1, dm2: 100, cm2: 1e4, mm2: 1e6, ha: 0.0001,
      mu: 0.0015, acre: 0.0002471054, ft2: 10.763910417, inch2: 1550.0031, yd2: 1.1959900463,
    },
  },
  volume: {
    name: "体积容量",
    units: {
      m3: 1, dm3: 1000, cm3: 1e6, L: 1000, mL: 1e6, hL: 10, dL: 1e4, cL: 1e5,
      barrel: 6.2898107704, gal_us: 264.17205236, gal_uk: 219.9692483,
      qt_us: 1056.6882094, pint_us: 2113.3764189, ft3: 35.314666721,
      in3: 61023.744095,
    },
  },
  speed: {
    name: "速度",
    units: {
      "m/s": 1, "km/h": 3.6, "mph": 2.2369362921, knot: 1.9438444924,
      "ft/s": 3.280839895, mach: 0.0029386699, c: 3.335640952e-9,
    },
  },
  pressure: {
    name: "压力",
    units: {
      Pa: 1, kPa: 0.001, MPa: 0.000001, hPa: 0.01, bar: 0.00001, mbar: 0.01,
      atm: 9.8692326672e-6, kgf_cm2: 1.019716213e-5, mmHg: 0.0075006168,
      torr: 0.0075006168, psi: 0.0001450377, mmH2O: 0.1019716213,
    },
  },
  power: {
    name: "功率",
    units: {
      W: 1, kW: 0.001, MW: 0.000001, hp: 0.0013410221, ps: 0.0013596216,
      kcal_s: 0.0002388459, "J/s": 1, "N·m/s": 1,
    },
  },
  heat: {
    name: "热量",
    units: {
      J: 1, kJ: 0.001, cal: 0.2388458966, kcal: 0.0002388459, kWh: 2.7777778e-7,
      Btu: 0.0009478171,
    },
  },
  force: {
    name: "力",
    units: { N: 1, kN: 0.001, kgf: 0.1019716213, dyn: 1e5, lbf: 0.2248089431 },
  },
  time: {
    name: "时间",
    units: {
      ms: 1000, s: 1, min: 1 / 60, h: 1 / 3600, day: 1 / 86400,
      week: 1 / 604800, year: 1 / 31536000, month: 1 / 2592000,
    },
  },
  data: {
    name: "数据大小",
    units: {
      bit: 8, B: 1, KB: 0.001, MB: 0.000001, GB: 1e-9, TB: 1e-12,
      KiB: 0.0009765625, MiB: 9.5367432e-7, GiB: 9.3132257e-10,
    },
  },
  angle: {
    name: "角度",
    units: {
      deg: 1, rad: 0.0174532925, grad: 1.1111111111, arcmin: 60, arcsec: 3600,
      mil: 17.777777778, turn: 1 / 360,
    },
  },
  density: {
    name: "密度",
    units: {
      "g/cm3": 1, "kg/m3": 1000, "g/L": 1000, "kg/dm3": 1, "g/mL": 1,
      "lb/ft3": 62.427960576,
    },
  },
  temperature: {
    name: "温度",
    units: { C: 1, F: 1, K: 1, R: 1, Re: 1 },
    convert(value, from, to) {
      // 统一转摄氏度
      let c: number;
      switch (from) {
        case "C": c = value; break;
        case "F": c = ((value - 32) * 5) / 9; break;
        case "K": c = value - 273.15; break;
        case "R": c = ((value - 491.67) * 5) / 9; break; // 兰氏
        case "Re": c = (value * 5) / 4; break; // 列氏
        default: throw new Error(`未知温度单位：${from}`);
      }
      switch (to) {
        case "C": return c;
        case "F": return (c * 9) / 5 + 32;
        case "K": return c + 273.15;
        case "R": return (c * 9) / 5 + 491.67;
        case "Re": return (c * 4) / 5;
        default: throw new Error(`未知温度单位：${to}`);
      }
    },
    note: "C=摄氏度 F=华氏度 K=开氏度 R=兰氏度 Re=列氏度",
  },
};

/** 支持的单位类别（含别名） */
export const UNIT_CATEGORY_NAMES = Object.keys(UNIT_CATEGORIES);

/** 通用换算：value from → to */
export function convertUnit(category: string, value: number, from: string, to: string): number {
  const cat = UNIT_CATEGORIES[category];
  if (!cat) {
    throw new Error(`未知单位类别：${category}，可选：${UNIT_CATEGORY_NAMES.join("、")}`);
  }
  if (!(from in cat.units)) {
    throw new Error(`类别 ${cat.name} 中无单位：${from}，可选：${Object.keys(cat.units).join("、")}`);
  }
  if (!(to in cat.units)) {
    throw new Error(`类别 ${cat.name} 中无单位：${to}，可选：${Object.keys(cat.units).join("、")}`);
  }
  if (cat.convert) return cat.convert(value, from, to);
  // units[X] = 1 基准单位等于多少 X 单位：value/units[from] 得基准值，再乘 units[to]
  const base = value / cat.units[from];
  return base * cat.units[to];
}
