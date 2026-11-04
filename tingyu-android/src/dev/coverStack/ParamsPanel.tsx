import { BLUR_LABEL, type BlurLevel, type CoverStackParams } from './params';

// src/dev/coverStack/ParamsPanel.tsx
// 调试面板：所有可调项都在这里改，参数对象本身集中在 params.ts。
// 滑动条只在高频输入时更新 React state，动画本体仍由动画器逐帧写 transform。

type NumericKey = Exclude<keyof CoverStackParams, 'blur'>;

interface SliderSpec {
    key: NumericKey;
    label: string;
    min: number;
    max: number;
    step: number;
    unit?: string;
    /** 小数位 */
    digits?: number;
}

const GROUPS: { title: string; sliders: SliderSpec[] }[] = [
    {
        title: '后两张姿态',
        sliders: [
            { key: 'rotSecond', label: '第二张角度', min: -14, max: 14, step: 0.5, unit: '°', digits: 1 },
            { key: 'rotThird', label: '第三张角度', min: -14, max: 14, step: 0.5, unit: '°', digits: 1 },
            { key: 'offsetSecondX', label: '第二张 X 错位', min: -40, max: 40, step: 1, unit: 'px' },
            { key: 'offsetSecondY', label: '第二张 Y 错位', min: -40, max: 40, step: 1, unit: 'px' },
            { key: 'offsetThirdX', label: '第三张 X 错位', min: -40, max: 40, step: 1, unit: 'px' },
            { key: 'offsetThirdY', label: '第三张 Y 错位', min: -40, max: 40, step: 1, unit: 'px' },
            { key: 'scaleSecond', label: '第二张缩放', min: 0.9, max: 1, step: 0.005, digits: 3 },
            { key: 'scaleThird', label: '第三张缩放', min: 0.88, max: 1, step: 0.005, digits: 3 },
        ],
    },
    {
        title: '运动',
        sliders: [
            { key: 'blurStrength', label: '残影强度', min: 0, max: 2, step: 0.1, unit: '×', digits: 1 },
            { key: 'inertia', label: '松手惯性', min: 0.6, max: 1.8, step: 0.05, unit: '×', digits: 2 },
            { key: 'commitDistance', label: '切歌距离', min: 0.12, max: 0.45, step: 0.01, unit: 'W', digits: 2 },
            { key: 'flingVelocity', label: '甩动阈值', min: 400, max: 1600, step: 25, unit: 'px/s' },
            { key: 'flingMinDistance', label: '甩动最低位移', min: 0.04, max: 0.3, step: 0.01, unit: 'W', digits: 2 },
            { key: 'exitDuration', label: '离场时长', min: 120, max: 400, step: 10, unit: 'ms' },
            { key: 'promoteDuration', label: '补位时长', min: 250, max: 800, step: 10, unit: 'ms' },
            { key: 'dragTilt', label: '拖动倾角', min: 0, max: 2, step: 0.5, unit: '°', digits: 1 },
        ],
    },
];

const BLUR_LEVELS: BlurLevel[] = ['off', 'soft', 'strong'];

interface ParamsPanelProps {
    params: CoverStackParams;
    open: boolean;
    onToggle: () => void;
    onChange: (patch: Partial<CoverStackParams>) => void;
    onReset: () => void;
}

export default function ParamsPanel({ params, open, onToggle, onChange, onReset }: ParamsPanelProps) {
    return (
        <section className="cs-params">
            <div className="cs-params__head">
                <button type="button" className="cs-debug__toggle" onClick={onToggle} aria-expanded={open} data-testid="params-toggle">
                    动效参数 {open ? '收起' : '展开'}
                </button>
                {open ? <button type="button" className="cs-params__reset" onClick={onReset}>复位</button> : null}
            </div>
            {open ? (
                <div className="cs-params__body" data-testid="params-panel">
                    <div className="cs-params__row">
                        <span>运动残影</span>
                        <div className="cs-params__chips">
                            {BLUR_LEVELS.map(level => (
                                <button
                                    key={level}
                                    type="button"
                                    className="cs-chip cs-chip--mini"
                                    data-on={params.blur === level}
                                    onClick={() => onChange({ blur: level })}
                                    data-testid={`blur-${level}`}
                                >
                                    {BLUR_LABEL[level]}
                                </button>
                            ))}
                        </div>
                    </div>
                    {GROUPS.map(group => (
                        <div className="cs-params__group" key={group.title}>
                            <h4>{group.title}</h4>
                            {group.sliders.map(slider => {
                                const value = params[slider.key];
                                const digits = slider.digits ?? 0;
                                return (
                                    <label className="cs-param" key={slider.key}>
                                        <span>{slider.label}</span>
                                        <input
                                            type="range"
                                            min={slider.min}
                                            max={slider.max}
                                            step={slider.step}
                                            value={value}
                                            onChange={event => onChange({ [slider.key]: Number(event.target.value) } as Partial<CoverStackParams>)}
                                        />
                                        <b>{value.toFixed(digits)}{slider.unit ?? ''}</b>
                                    </label>
                                );
                            })}
                        </div>
                    ))}
                </div>
            ) : null}
        </section>
    );
}
