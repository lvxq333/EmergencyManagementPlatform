(function () {
    'use strict';

    const REGION_NAMES = [
        '东城区', '西城区', '朝阳区', '丰台区', '石景山区', '海淀区', '门头沟区', '房山区',
        '通州区', '顺义区', '昌平区', '大兴区', '怀柔区', '平谷区', '密云区', '延庆区'
    ];

    const DOMAIN_META = {
        rain: { label: '短临降雨', color: '#36c6ff', icon: 'fa-cloud-showers-heavy' },
        gas: { label: '燃气管网', color: '#f3a33b', icon: 'fa-fire-flame-simple' },
        water: { label: '供水管网', color: '#28a9ff', icon: 'fa-droplet' },
        heat: { label: '供热管网', color: '#ff6b63', icon: 'fa-temperature-high' },
        coupling: { label: '耦合风险', color: '#a78bfa', icon: 'fa-link' }
    };

    const PAGE_TITLES = {
        overview: '综合态势', data: '数据接入', rain: '短临降雨', gas: '燃气管网', water: '供水管网', heat: '供热管网',
        coupling: '耦合研判', alerts: '预警处置', history: '历史分析'
    };

    const DATA_SOURCES = [
        { name: '城市气象站网', icon: 'fa-cloud-sun-rain', type: '环境气象', protocol: 'MQTT', frequency: '1分钟', arrived: '2秒前', completeness: '99.8%', status: 'online' },
        { name: '短临降雨预测模型', icon: 'fa-cloud-showers-heavy', type: '预测格点', protocol: 'HTTP API', frequency: '5分钟', arrived: '38秒前', completeness: '99.5%', status: 'online' },
        { name: '燃气甲烷监测终端', icon: 'fa-fire-flame-simple', type: '高频时序', protocol: 'MQTT', frequency: '5秒', arrived: '1秒前', completeness: '99.7%', status: 'online' },
        { name: '供水压力与流量监测', icon: 'fa-droplet', type: '高频时序', protocol: 'MQTT', frequency: '10秒', arrived: '4秒前', completeness: '99.1%', status: 'online' },
        { name: '供热运行监测接口', icon: 'fa-temperature-high', type: '结构化数据', protocol: 'HTTP API', frequency: '30秒', arrived: '12秒前', completeness: '98.9%', status: 'online' },
        { name: '地表与管道位移监测', icon: 'fa-arrows-down-to-line', type: '位移时序', protocol: '文件交换', frequency: '1分钟', arrived: '18秒前', completeness: '94.6%', status: 'warning' },
        { name: '地下管网空间底图', icon: 'fa-map', type: '空间数据', protocol: '文件交换', frequency: '每日', arrived: '今日 02:00', completeness: '100%', status: 'online' }
    ];

    const MAP_VIEW = {
        initialZoom: 1.08,
        minZoom: 0.85,
        maxZoom: 2.5,
        wheelStep: 1.12
    };

    const MAP_LABELS = {
        'overview-map': '综合风险地图',
        'rain-map': '短临降雨地图',
        'pipeline-map': '管网专题地图',
        'coupling-map': '耦合风险地图'
    };

    const BASE_RISK = {
        comprehensive: [56, 49, 78, 65, 48, 59, 71, 82, 74, 53, 62, 68, 46, 43, 51, 58],
        rain: [32, 28, 65, 71, 39, 55, 74, 88, 69, 36, 58, 77, 40, 33, 46, 67],
        gas: [58, 51, 82, 68, 47, 61, 64, 79, 70, 55, 63, 72, 46, 41, 49, 57],
        water: [45, 52, 69, 76, 56, 64, 71, 84, 78, 48, 67, 73, 44, 51, 58, 62],
        heat: [62, 59, 74, 71, 53, 68, 64, 77, 69, 57, 79, 66, 48, 46, 52, 73]
    };

    // 首页第一版指标模型：目前使用可解释的模拟输入，后续可由接口返回同名字段替换。
    const DEFAULT_OVERVIEW_WEIGHTS = { rain: 0.25, gas: 0.20, water: 0.20, heat: 0.15, coupling: 0.20 };
    const RAIN_MODEL = {
        intensity: 76, forecast: 80, probability: 74, cumulative: 68, exposure: 82,
        weights: { intensity: 0.35, forecast: 0.35, probability: 0.15, cumulative: 0.10, exposure: 0.05 }
    };
    const DEFAULT_RAIN_WEIGHTS = { ...RAIN_MODEL.weights };
    const WEIGHT_LABELS = {
        overview: { rain: '短临降雨', gas: '燃气管网', water: '供水管网', heat: '供热管网', coupling: '多系统耦合' },
        rain: { intensity: '当前降雨强度', forecast: '未来60分钟预测', probability: '降雨概率', cumulative: '累计降雨', exposure: '管网暴露' }
    };

    const PIPELINE_SEGMENTS = Object.entries({ gas: 18, water: 15, heat: 11 }).flatMap(([type, count]) =>
        Array.from({ length: count }, (_, index) => {
            const region = REGION_NAMES[(index * 3 + (type === 'water' ? 2 : type === 'heat' ? 5 : 0)) % REGION_NAMES.length];
            const score = Math.round(80 + ((index * 7 + (type === 'gas' ? 3 : type === 'water' ? 8 : 5)) % 18) + (index % 4) * 0.3);
            const prefix = type === 'gas' ? 'G' : type === 'water' ? 'W' : 'H';
            return {
                id: `${prefix}-${region.slice(0, 2)}-${String(index + 1).padStart(3, '0')}`,
                type, region, score, status: 'active',
                factor: type === 'gas' ? '甲烷浓度与压力变化' : type === 'water' ? '压力下降与流量异常' : '供回水温差与补水量'
            };
        })
    );

    const PIPELINE_RISK_SCORES = { gas: 72.6, water: 69.3, heat: 65.8 };

    const PIPELINE_CONFIGS = {
        gas: {
            title: '燃气管网风险感知', eyebrow: 'GAS NETWORK', color: '#f3a33b',
            description: '监测甲烷浓度、压力与泄漏风险，研判腐蚀、外力破坏及地质变化影响。',
            mapTitle: '燃气管网区域风险', trendTitle: '甲烷浓度与管道压力趋势', chainTitle: '燃气泄漏风险演化链',
            kpis: [
                ['甲烷浓度', '0.82', '%LEL', '较1小时前 +0.06', 'fa-wind', 'up'],
                ['管道压力', '3.58', 'MPa', '运行区间正常', 'fa-gauge', 'steady'],
                ['泄漏监测点', '12', '处', '2处重点关注', 'fa-location-dot', 'up'],
                ['超压点位', '3', '处', '较昨日 -1', 'fa-arrow-up-right-dots', 'down'],
                ['高风险管段', '18', '条', '占全部管段 4.3%', 'fa-route', 'up'],
                ['未处置预警', '4', '条', '含1条红色预警', 'fa-triangle-exclamation', 'up']
            ],
            metrics: [['甲烷浓度', '0.82 %LEL'], ['管道压力', '3.58 MPa'], ['管道形变', '1.62 mm'], ['阴保电位', '-0.96 V']],
            factors: [['第三方破坏', 88], ['腐蚀老化', 76], ['焊缝/材料缺陷', 63], ['地质沉降', 57], ['超压运行', 43]],
            series: [
                { name: '甲烷浓度', color: '#f3a33b', unit: '%LEL', base: 0.72, amp: 0.16 },
                { name: '管道压力', color: '#a78bfa', unit: 'MPa', base: 3.55, amp: 0.19 }
            ],
            chain: [
                ['fa-hammer', '外部扰动', '施工、腐蚀或沉降', '外部扰动改变管道受力或破坏防护层，是泄漏风险的重要前置因素。'],
                ['fa-arrows-left-right-to-line', '结构受损', '变形、穿孔或开裂', '管体、焊缝或接口发生局部损伤，监测数据出现形变与压力异常。'],
                ['fa-wind', '燃气泄漏', '浓度与压力异常', '泄漏气体可能沿地下裂隙和相邻管沟扩散并在密闭空间聚集。'],
                ['fa-fire-flame-curved', '次生风险', '火灾、爆炸或窒息', '当浓度进入危险范围并遇到点火源时，次生事故风险显著上升。'],
                ['fa-people-arrows-left-right', '联动处置', '关阀、疏散与抢修', '系统联动推送告警，建议核查现场并按预案执行关阀、疏散和抢修。']
            ],
            evidence: ['第三方施工和外力破坏', '腐蚀与管壁减薄', '焊接和安装质量缺陷', '内部超压与压力波动', '地质沉降和自然灾害']
        },
        water: {
            title: '供水管网风险感知', eyebrow: 'WATER NETWORK', color: '#28a9ff',
            description: '监测压力、流量与爆漏风险，识别水锤、腐蚀老化和管网结构薄弱区域。',
            mapTitle: '供水管网区域风险', trendTitle: '供水压力与瞬时流量趋势', chainTitle: '供水爆漏风险演化链',
            kpis: [
                ['供水压力', '0.42', 'MPa', '较1小时前 -0.03', 'fa-gauge-high', 'down'],
                ['瞬时流量', '1,286', 'm³/h', '处于日常区间', 'fa-water', 'steady'],
                ['压力波动', '8.6', '%', '2处波动异常', 'fa-wave-square', 'up'],
                ['漏损率', '9.4', '%', '较上周 -0.7%', 'fa-droplet-slash', 'down'],
                ['爆管风险点', '15', '处', '3处建议巡查', 'fa-burst', 'up'],
                ['预计影响用户', '2,460', '户', '来自2条预警', 'fa-house-circle-exclamation', 'up']
            ],
            metrics: [['供水压力', '0.42 MPa'], ['瞬时流量', '1,286 m³/h'], ['压力波动', '8.6 %'], ['管龄', '18 年']],
            factors: [['管网老龄化', 86], ['腐蚀与结垢', 75], ['地表荷载', 66], ['水锤现象', 59], ['施工质量', 48]],
            series: [
                { name: '供水压力', color: '#28a9ff', unit: 'MPa', base: 0.43, amp: 0.08 },
                { name: '瞬时流量', color: '#2dd4a3', unit: 'm³/h', base: 1230, amp: 160 }
            ],
            chain: [
                ['fa-clock-rotate-left', '管网老化', '腐蚀、结垢与缺陷', '长期运行导致管壁减薄、接口性能下降，形成结构薄弱点。'],
                ['fa-wave-square', '水力扰动', '水锤或压力波动', '泵阀操作和用水变化引起瞬态压力，薄弱点承受附加载荷。'],
                ['fa-burst', '爆管管漏', '压力突降与流量异常', '爆漏发生后局部压力快速下降，流量和夜间最小流量出现异常。'],
                ['fa-road-barrier', '地表影响', '积水、沉降与交通影响', '持续泄漏可能冲刷土体，引发路面空洞、积水并影响相邻管线。'],
                ['fa-screwdriver-wrench', '隔离抢修', '关阀与供水调度', '建议定位漏点、关闭关联阀门，并评估临时供水和抢修方案。']
            ],
            evidence: ['管道材质与管龄', '腐蚀结垢和接口方式', '管道基础与施工质量', '水锤及气囊现象', '地质条件与地表荷载']
        },
        heat: {
            title: '供热管网风险感知', eyebrow: 'HEATING NETWORK', color: '#ff6b63',
            description: '监测供回水温度、压力与流量，研判泄漏、断供和供热不足风险。',
            mapTitle: '供热管网区域风险', trendTitle: '供回水温度与压力趋势', chainTitle: '供热泄漏与断供风险演化链',
            kpis: [
                ['供水温度', '86.4', '℃', '较1小时前 +1.2', 'fa-temperature-arrow-up', 'up'],
                ['回水温度', '51.8', '℃', '温差运行正常', 'fa-temperature-arrow-down', 'steady'],
                ['管网压力', '1.26', 'MPa', '2处压力偏低', 'fa-gauge', 'down'],
                ['热力流量', '968', 't/h', '较昨日 +2.1%', 'fa-arrow-right-arrow-left', 'steady'],
                ['泄漏风险点', '11', '处', '补偿器风险4处', 'fa-faucet-drip', 'up'],
                ['断供影响范围', '3', '片区', '预计影响1,820户', 'fa-house-chimney-crack', 'up']
            ],
            metrics: [['供水温度', '86.4 ℃'], ['回水温度', '51.8 ℃'], ['管网压力', '1.26 MPa'], ['热力流量', '968 t/h']],
            factors: [['腐蚀老化', 83], ['施工与焊缝质量', 72], ['补偿器异常', 64], ['外力破坏', 55], ['操作与管理', 42]],
            series: [
                { name: '供水温度', color: '#ff6b63', unit: '℃', base: 85, amp: 6 },
                { name: '回水温度', color: '#f3a33b', unit: '℃', base: 52, amp: 4 },
                { name: '管网压力', color: '#a78bfa', unit: 'MPa', base: 1.25, amp: 0.13 }
            ],
            chain: [
                ['fa-gears', '设备与管线缺陷', '腐蚀、焊缝或补偿器', '管道、焊缝、法兰、阀门和补偿器是主要泄漏关注对象。'],
                ['fa-temperature-half', '参数异常', '温差、压力与流量变化', '泄漏或设备异常会引起压力下降、补水量增加和供回水温差变化。'],
                ['fa-faucet-drip', '热水泄漏', '热损失与周边影响', '高温介质泄漏产生热损失，并可能影响道路和邻近地下设施。'],
                ['fa-house-circle-xmark', '供热失效', '断供或供热不足', '泄漏、锅炉、热力站或泵站故障可能导致局部断供或供热不足。'],
                ['fa-screwdriver-wrench', '调度抢修', '隔离、补水与恢复', '建议隔离故障区段、调整热源和水力平衡，并组织现场抢修。']
            ],
            evidence: ['设备老化和管道腐蚀', '施工及焊缝质量', '补偿器、法兰和阀门状态', '外力与地质变化', '运行操作和管理缺陷']
        }
    };

    const COUPLING_ZONES = [
        { id: 'CZ-001', name: '国贸桥交叉区', region: '朝阳区', score: 86.2, factor: 1.28, rain: 78, gas: 84, water: 72, heat: 68, systems: '降雨、燃气、供水', impact: '核心商圈道路与地下空间' },
        { id: 'CZ-002', name: '丽泽路交叉区', region: '丰台区', score: 79.6, factor: 1.22, rain: 65, gas: 70, water: 82, heat: 74, systems: '降雨、供水、供热', impact: '交通枢纽与周边居民区' },
        { id: 'CZ-003', name: '回龙观交叉区', region: '昌平区', score: 74.3, factor: 1.18, rain: 69, gas: 63, water: 71, heat: 81, systems: '降雨、供水、供热', impact: '大型社区与轨道交通' },
        { id: 'CZ-004', name: '良乡交叉区', region: '房山区', score: 82.7, factor: 1.25, rain: 88, gas: 76, water: 84, heat: 70, systems: '降雨、燃气、供水', impact: '低洼道路与综合管廊' },
        { id: 'CZ-005', name: '望京北交叉区', region: '朝阳区', score: 78.4, factor: 1.21, rain: 72, gas: 78, water: 74, heat: 69, systems: '降雨、燃气、供水', impact: '产业园区与商业综合体' },
        { id: 'CZ-006', name: '五棵松交叉区', region: '海淀区', score: 73.8, factor: 1.16, rain: 61, gas: 68, water: 77, heat: 75, systems: '供水、供热、燃气', impact: '大型场馆与周边道路' },
        { id: 'CZ-007', name: '亦庄核心区', region: '大兴区', score: 81.1, factor: 1.24, rain: 76, gas: 82, water: 73, heat: 71, systems: '降雨、燃气、供水', impact: '产业园和重点厂区' },
        { id: 'CZ-008', name: '通州副中心交叉区', region: '通州区', score: 69.5, factor: 1.12, rain: 58, gas: 64, water: 73, heat: 68, systems: '降雨、供水、供热', impact: '行政办公与公共服务设施' },
        { id: 'CZ-009', name: '石景山路交叉区', region: '石景山区', score: 80.6, factor: 1.23, rain: 66, gas: 72, water: 75, heat: 79, systems: '降雨、供水、供热', impact: '山前道路与老旧社区' },
        { id: 'CZ-010', name: '清河交叉区', region: '海淀区', score: 71.8, factor: 1.14, rain: 64, gas: 67, water: 72, heat: 76, systems: '供水、供热、燃气', impact: '高校园区与居住区' },
        { id: 'CZ-011', name: '顺义新城交叉区', region: '顺义区', score: 68.9, factor: 1.10, rain: 57, gas: 62, water: 70, heat: 66, systems: '降雨、供水、燃气', impact: '新城道路与机场周边' },
        { id: 'CZ-012', name: '门头沟新城交叉区', region: '门头沟区', score: 75.6, factor: 1.17, rain: 79, gas: 60, water: 72, heat: 68, systems: '降雨、供水、供热', impact: '山洪沟道与沿线居民区' }
    ];

    let alerts = [
        { id: 'RW-20260802-017', type: 'coupling', level: 'red', region: '房山区', object: '良乡交叉区 CZ-004', condition: '降雨风险 88，供水风险 84，耦合系数 1.25', time: '10:26:18', status: 'pending' },
        { id: 'RW-20260802-016', type: 'gas', level: 'red', region: '朝阳区', object: '燃气管段 G-CHY-028', condition: '甲烷浓度持续上升且压力异常下降', time: '10:21:42', status: 'processing' },
        { id: 'RW-20260802-015', type: 'rain', level: 'orange', region: '房山区', object: '短临降雨预测单元 R-110111', condition: '未来60分钟预测降雨强度达到 52 mm/h', time: '10:18:05', status: 'assigned' },
        { id: 'RW-20260802-014', type: 'water', level: 'orange', region: '丰台区', object: '供水管段 W-FT-119', condition: '压力下降 18%，瞬时流量异常增加', time: '10:12:36', status: 'pending' },
        { id: 'RW-20260802-013', type: 'heat', level: 'yellow', region: '昌平区', object: '热力管段 H-CP-056', condition: '供回水温差低于动态阈值', time: '10:08:11', status: 'processing' },
        { id: 'RW-20260802-012', type: 'rain', level: 'yellow', region: '门头沟区', object: '累计降雨监测单元 R-110109', condition: '累计降雨达到黄色预警阈值', time: '10:03:57', status: 'pending' },
        { id: 'RW-20260802-011', type: 'gas', level: 'orange', region: '大兴区', object: '燃气管段 G-DX-091', condition: '管道形变与甲烷浓度组合超阈值', time: '09:56:23', status: 'assigned' },
        { id: 'RW-20260802-010', type: 'water', level: 'yellow', region: '通州区', object: '供水管段 W-TZ-083', condition: '夜间最小流量偏离历史区间', time: '09:44:08', status: 'closed' },
        { id: 'RW-20260802-009', type: 'heat', level: 'orange', region: '海淀区', object: '热力站 H-HD-012', condition: '补水量与管网压力联合异常', time: '09:37:45', status: 'closed' }
    ];

    let rules = [
        { id: 1, name: '短临强降雨橙色预警', type: 'rain', level: 'orange', metric: '未来60分钟降雨强度', threshold: '> 50 mm/h', condition: '预测概率 ≥ 70%', enabled: true },
        { id: 2, name: '燃气泄漏多指标预警', type: 'gas', level: 'red', metric: '甲烷浓度 + 压力变化', threshold: '组合指数 > 85', condition: '持续时间 ≥ 3分钟', enabled: true },
        { id: 3, name: '供水爆管风险预警', type: 'water', level: 'orange', metric: '压力下降率', threshold: '> 15%', condition: '瞬时流量同步增加', enabled: true },
        { id: 4, name: '供热断供风险预警', type: 'heat', level: 'yellow', metric: '供回水温差', threshold: '< 动态下限', condition: '持续时间 ≥ 10分钟', enabled: true },
        { id: 5, name: '降雨-位移-管网耦合预警', type: 'coupling', level: 'red', metric: '耦合风险指数', threshold: '> 80', condition: '至少两个系统风险升高', enabled: true }
    ];

    const timelineEvents = [
        ['10:28:32', '系统自动生成耦合风险预警', '良乡交叉区降雨、供水与燃气风险同时升高，生成红色预警 RW-20260802-017。'],
        ['10:24:06', '值班员确认燃气异常', '管理员确认朝阳区燃气管段 G-CHY-028 异常，事件进入处置中状态。'],
        ['10:20:18', '降雨预警派发巡检任务', '房山区未来60分钟降雨橙色预警已派发至管网联合巡检组。'],
        ['10:14:52', '供水压力异常完成初步研判', '系统识别丰台区压力下降与流量增加，建议排查爆管或阀门异常。'],
        ['09:51:20', '通州区供水预警关闭', '经现场核查为夜间调度操作引起，数据恢复正常，事件完成闭环。']
    ];

    const state = {
        page: 'overview', pipeline: 'gas', overviewLayer: 'comprehensive', rainHorizon: 0,
        rainLayer: 'intensity', rainPlaying: false, selectedRegion: '房山区', couplingZone: COUPLING_ZONES[0],
        simulationPaused: false, mapReady: false, pipelineRange: 24, historyPeriod: 168,
        readableMode: localStorage.getItem('risk-platform-readable-mode') === 'true', isAdmin: false
    };

    function validWeightSet(input, defaults) {
        const result = {};
        Object.keys(defaults).forEach((key) => {
            const value = Number(input?.[key]);
            result[key] = Number.isFinite(value) && value >= 0 ? value : defaults[key];
        });
        return result;
    }

    function loadWeightConfig() {
        const defaults = { overview: { ...DEFAULT_OVERVIEW_WEIGHTS }, rain: { ...DEFAULT_RAIN_WEIGHTS }, regions: {} };
        try {
            const saved = JSON.parse(localStorage.getItem('risk-platform-weight-config') || 'null');
            if (!saved) return defaults;
            const regions = Object.fromEntries(Object.entries(saved.regions || {}).map(([region, profile]) => [region, {
                overview: validWeightSet(profile.overview, defaults.overview),
                rain: validWeightSet(profile.rain, defaults.rain)
            }]));
            return {
                overview: validWeightSet(saved.overview, defaults.overview),
                rain: validWeightSet(saved.rain, defaults.rain),
                regions
            };
        } catch (error) {
            return defaults;
        }
    }

    let weightConfig = loadWeightConfig();

    const charts = {};
    const mapViews = {};
    const mapWheelHandlers = {};
    let rainPlayTimer = null;

    const $ = (selector, scope = document) => scope.querySelector(selector);
    const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const pad = (value) => String(value).padStart(2, '0');
    const randomBetween = (min, max) => min + Math.random() * (max - min);
    const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    const vf = (size) => size + (state.readableMode ? 2 : 0);

    function riskLevel(value) {
        if (value >= 80) return { key: 'high', label: '高风险', color: '#ff4f64' };
        if (value >= 60) return { key: 'medium', label: '中风险', color: '#ff902e' };
        return { key: 'low', label: '低风险', color: '#2dd4a3' };
    }

    function currentTime(offsetMinutes = 0) {
        const date = new Date(Date.now() + offsetMinutes * 60000);
        return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    function getWeightProfile(region = '北京市') {
        return region !== '北京市' && weightConfig.regions[region]
            ? weightConfig.regions[region]
            : { overview: weightConfig.overview, rain: weightConfig.rain };
    }

    function weightTotal(weights) {
        return Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0);
    }

    function persistWeightConfig() {
        localStorage.setItem('risk-platform-weight-config', JSON.stringify(weightConfig));
    }

    function chart(id) {
        if (!window.echarts) return null;
        const element = document.getElementById(id);
        if (!element) return null;
        if (!charts[id]) charts[id] = echarts.init(element);
        return charts[id];
    }

    function regionData(layer, drift = 0) {
        const values = BASE_RISK[layer] || BASE_RISK.comprehensive;
        return REGION_NAMES.map((name, index) => ({
            name,
            value: clamp(Math.round(values[index] + drift + Math.sin(index + Date.now() / 90000) * 2), 12, 98)
        }));
    }

    const round1 = (value) => Math.round(value * 10) / 10;
    const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

    function calculateRainScore(weights = weightConfig.rain, values = RAIN_MODEL) {
        return round1(Object.entries(weights).reduce((sum, [key, weight]) => sum + values[key] * weight, 0));
    }

    function calculateRegionalRainScore(region, weights) {
        const base = rainValues().find((item) => item.name === region)?.value || 40;
        const values = {
            intensity: base,
            forecast: clamp(base + 7, 0, 100),
            probability: clamp(base + 2, 0, 100),
            cumulative: clamp(base - 5, 0, 100),
            exposure: clamp(base + 10, 0, 100)
        };
        return calculateRainScore(weights, values);
    }

    function calculateCouplingScore() {
        return round1(average(COUPLING_ZONES.map((zone) => zone.score)));
    }

    function calculateOverviewSnapshot(region = '北京市') {
        const profile = getWeightProfile(region);
        const regionIndex = REGION_NAMES.indexOf(region);
        const isCitywide = region === '北京市' || regionIndex < 0;
        const components = {
            rain: isCitywide ? calculateRainScore(profile.rain) : calculateRegionalRainScore(region, profile.rain),
            gas: isCitywide ? PIPELINE_RISK_SCORES.gas : BASE_RISK.gas[regionIndex],
            water: isCitywide ? PIPELINE_RISK_SCORES.water : BASE_RISK.water[regionIndex],
            heat: isCitywide ? PIPELINE_RISK_SCORES.heat : BASE_RISK.heat[regionIndex],
            coupling: isCitywide ? calculateCouplingScore() : round1(average(COUPLING_ZONES.filter((zone) => zone.region === region).map((zone) => zone.score)) || 45)
        };
        const overall = round1(Object.entries(profile.overview).reduce((sum, [key, weight]) => sum + components[key] * weight, 0));
        const highSegments = PIPELINE_SEGMENTS.filter((segment) => segment.status === 'active' && segment.score >= 80);
        const highZones = COUPLING_ZONES.filter((zone) => zone.score >= 80);
        return {
            components,
            overall,
            highSegments,
            highZones,
            activeZones: COUPLING_ZONES,
            asOf: currentTime()
        };
    }

    function pipelineSegmentsByType(type) {
        return PIPELINE_SEGMENTS.filter((segment) => segment.type === type);
    }

    function mapOption(data, options = {}) {
        const metricLabel = options.metricLabel || '风险指数';
        const max = options.max || 100;
        const colors = options.colors || ['#19bfc4', '#f7c948', '#ff902e', '#ff4f64'];
        return {
            animationDurationUpdate: 550,
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(5, 22, 46, 0.96)',
                borderColor: 'rgba(72, 164, 255, 0.45)',
                textStyle: { color: '#eaf4ff', fontSize: 11 },
                formatter: (params) => `<strong>${params.name}</strong><br>${metricLabel}：${params.value ?? '--'}${options.unit || ''}`
            },
            visualMap: {
                min: 0, max, left: 18, bottom: 38, itemHeight: 100, itemWidth: 8,
                text: [options.highText || '高', options.lowText || '低'], calculable: false,
                textStyle: { color: '#c2d5e7', fontSize: vf(11) }, inRange: { color: colors }
            },
            series: [{
                type: 'map', map: 'beijing', roam: false, zoom: options.zoom || MAP_VIEW.initialZoom,
                scaleLimit: { min: MAP_VIEW.minZoom, max: MAP_VIEW.maxZoom }, data,
                selectedMode: false,
                label: { show: true, color: '#ffffff', fontSize: vf(11), fontWeight: 700, textBorderColor: '#09203d', textBorderWidth: 2 },
                itemStyle: { areaColor: '#16446c', borderColor: '#6fa1c0', borderWidth: 0.65 },
                emphasis: { label: { color: '#fff', fontSize: vf(12), textBorderColor: '#09203d', textBorderWidth: 2 }, itemStyle: { areaColor: '#256a94', borderColor: '#d7efff', borderWidth: 1.2 } }
            }]
        };
    }

    function bindCenteredWheelZoom(id, instance) {
        const element = document.getElementById(id);
        if (!element) return;
        if (mapWheelHandlers[id]) element.removeEventListener('wheel', mapWheelHandlers[id]);
        mapWheelHandlers[id] = (event) => {
            event.preventDefault();
            const currentZoom = mapViews[id] && mapViews[id].zoom || MAP_VIEW.initialZoom;
            const zoomFactor = event.deltaY < 0 ? MAP_VIEW.wheelStep : 1 / MAP_VIEW.wheelStep;
            const nextZoom = clamp(currentZoom * zoomFactor, MAP_VIEW.minZoom, MAP_VIEW.maxZoom);
            if (Math.abs(nextZoom - currentZoom) < 0.0001) return;
            mapViews[id] = { zoom: nextZoom };
            instance.setOption({ series: [{ zoom: nextZoom }] });
        };
        element.addEventListener('wheel', mapWheelHandlers[id], { passive: false });
    }

    function setMap(id, data, options = {}) {
        const instance = chart(id);
        if (!instance || !state.mapReady) return;
        const currentOption = typeof instance.getOption === 'function' ? instance.getOption() || {} : {};
        const currentSeries = currentOption.series && currentOption.series[0];
        const savedZoom = mapViews[id] && mapViews[id].zoom;
        const currentZoom = Number(currentSeries && currentSeries.zoom);
        const zoom = clamp(savedZoom || currentZoom || MAP_VIEW.initialZoom, MAP_VIEW.minZoom, MAP_VIEW.maxZoom);
        mapViews[id] = { zoom };
        instance.setOption(mapOption(data, { ...options, zoom }), true);
        bindCenteredWheelZoom(id, instance);
        instance.off('click');
        instance.on('click', (params) => {
            if (!params.name) return;
            state.selectedRegion = params.name;
            if (id === 'overview-map') {
                renderOverviewRegion();
                setMap('overview-map', regionData(state.overviewLayer), { metricLabel: layerLabel(state.overviewLayer) });
            } else if (id === 'rain-map') {
                renderRainRanking(params.name);
            } else if (id === 'pipeline-map') {
                renderPipelineRegion();
                setMap('pipeline-map', regionData(state.pipeline), { metricLabel: `${DOMAIN_META[state.pipeline].label}风险指数` });
            } else if (id === 'coupling-map') {
                const matched = COUPLING_ZONES.find((zone) => zone.region === params.name);
                if (matched) selectCouplingZone(matched.id);
                else showToast('该区域暂无重点交叉区', `${params.name}当前显示行政区综合耦合风险。`, 'info');
            }
        });
    }

    function resetMapView(id) {
        const instance = charts[id];
        if (!instance || !state.mapReady) return;
        mapViews[id] = { zoom: MAP_VIEW.initialZoom };
        instance.setOption({
            series: [{
                zoom: MAP_VIEW.initialZoom
            }]
        });
        showToast('地图已复位', `${MAP_LABELS[id] || '地图'}已恢复初始中心与缩放比例。`, 'success');
    }

    function layerLabel(layer) {
        const labels = { comprehensive: '综合风险指数', rain: '短临降雨风险', gas: '燃气风险指数', water: '供水风险指数', heat: '供热风险指数' };
        return labels[layer] || '风险指数';
    }

    async function loadBeijingMap() {
        const loadingEls = $$('.map-loading');
        try {
            if (!window.echarts) throw new Error('ECharts 图表库未加载');
            let response = await fetch('assets/beijing.json?v=20260802-mapfix3', { cache: 'no-store' });
            if (!response.ok) {
                response = await fetch('https://geo.datav.aliyun.com/areas_v3/bound/110000_full.json');
            }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const geoJson = await response.json();
            echarts.registerMap('beijing', geoJson);
            state.mapReady = true;
            renderActivePage();
            loadingEls.forEach((el) => el.classList.add('hidden'));
        } catch (error) {
            state.mapReady = false;
            loadingEls.forEach((el) => {
                el.classList.remove('hidden');
                el.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>地图加载失败，请刷新页面重试';
            });
            console.error('北京地图加载失败', error);
        }
    }

    function renderKpis(containerId, items, color = '#19c5f6') {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = items.map((item) => {
            const [label, value, unit, foot, icon, trend = 'steady', itemColor = color, detailKey = ''] = item;
            const arrow = trend === 'up' ? 'fa-arrow-trend-up' : trend === 'down' ? 'fa-arrow-trend-down' : 'fa-minus';
            const interactive = detailKey ? ` is-clickable" role="button" tabindex="0" data-overview-detail="${detailKey}" aria-label="查看${label}明细与来源"` : '"';
            return `<article class="kpi-card${interactive} style="--kpi-color:${itemColor}">
                <div class="kpi-top"><span class="kpi-label">${label}</span><span class="kpi-icon"><i class="fa-solid ${icon}"></i></span></div>
                <div class="kpi-value-row"><strong class="kpi-value">${value}</strong><span class="kpi-unit">${unit}</span></div>
                <div class="kpi-foot"><span>${foot}</span><i class="fa-solid ${arrow} trend-${trend}"></i></div>
            </article>`;
        }).join('');
    }

    function renderOverview() {
        const snapshot = calculateOverviewSnapshot();
        const { components } = snapshot;
        const level = riskLevel(snapshot.overall);
        const regionDistribution = regionData('comprehensive').reduce((counts, item) => {
            const key = item.value >= 80 ? 'high' : item.value >= 60 ? 'medium' : 'low';
            counts[key] += 1;
            return counts;
        }, { high: 0, medium: 0, low: 0 });
        const highSegmentBreakdown = ['gas', 'water', 'heat'].map((type) => `${DOMAIN_META[type].label.replace('管网', '')}${pipelineSegmentsByType(type).filter((segment) => segment.score >= 80).length}`).join(' · ');
        $('#overview-overall-level').textContent = level.label;
        $('#overview-overall-score').textContent = snapshot.overall.toFixed(1);
        $('.overall-status .status-orb').className = `status-orb ${level.key === 'high' ? 'danger' : level.key === 'medium' ? 'warning' : 'normal'}`;
        renderKpis('overview-kpis', [
            ['综合风险指数', snapshot.overall.toFixed(1), '', '五类风险按权重综合计算', 'fa-shield-halved', 'up', '#ff902e', 'overall'],
            ['短临降雨风险', components.rain.toFixed(1), '', '强度35% · 预测35% · 其他30%', 'fa-cloud-showers-heavy', 'up', '#36c6ff', 'rain'],
            ['高风险管段', String(snapshot.highSegments.length), '条', highSegmentBreakdown, 'fa-route', 'up', '#ff6b63', 'pipeline'],
            ['重点交叉区域', String(snapshot.activeZones.length), '处', `${snapshot.highZones.length}处耦合风险较高`, 'fa-code-branch', 'steady', '#a78bfa', 'coupling'],
            ['待处置预警', String(alerts.filter((a) => a.status !== 'closed').length), '条', '含2条红色预警', 'fa-bell', 'up', '#ff4f64']
        ]);

        const pie = chart('overview-risk-pie');
        if (pie) pie.setOption({
            tooltip: { trigger: 'item', backgroundColor: '#071a34', borderColor: '#2f6d9f', textStyle: { color: '#fff', fontSize: vf(12) } },
            legend: { bottom: 4, textStyle: { color: '#c0d2e3', fontSize: vf(11) }, itemWidth: 11, itemHeight: 7 },
            series: [{ type: 'pie', radius: ['48%', '70%'], center: ['50%', '44%'], label: { show: false },
                data: [{ value: regionDistribution.high, name: '高风险', itemStyle: { color: '#ff4f64' } }, { value: regionDistribution.medium, name: '中风险', itemStyle: { color: '#ff902e' } }, { value: regionDistribution.low, name: '低风险', itemStyle: { color: '#20b8c7' } }] }]
        });

        $('#domain-ranking').innerHTML = [
            ['短临降雨', components.rain, '#36c6ff'], ['燃气管网', components.gas, '#f3a33b'], ['供水管网', components.water, '#28a9ff'], ['供热管网', components.heat, '#ff6b63']
        ].map(([name, value, color]) => `<div class="domain-rank-item"><div class="rank-head"><span><i class="domain-dot" style="background:${color}"></i>${name}</span><b>${value}</b></div><div class="rank-bar"><span style="width:${value}%;background:${color}"></span></div></div>`).join('');

        renderAlertPreview();
        setMap('overview-map', regionData(state.overviewLayer), { metricLabel: layerLabel(state.overviewLayer) });
        renderOverviewTrend();
        renderOverviewRegion();
    }

    function renderOverviewTrend() {
        const instance = chart('overview-trend');
        if (!instance) return;
        const snapshot = calculateOverviewSnapshot();
        const pipelineAverage = round1(average([snapshot.components.gas, snapshot.components.water, snapshot.components.heat]));
        const hours = Array.from({ length: 24 }, (_, i) => `${pad(i)}:00`);
        const series = [
            ['综合风险', '#a78bfa', snapshot.overall, 6], ['短临降雨', '#36c6ff', snapshot.components.rain, 10], ['管网风险', '#ff902e', pipelineAverage, 8]
        ].map(([name, color, base, amp], sIndex) => ({
            name, type: 'line', smooth: true, showSymbol: false,
            data: hours.map((_, i) => Math.round(base + Math.sin(i / 3 + sIndex) * amp + Math.cos(i / 5) * 3)),
            lineStyle: { width: 2, color }, areaStyle: sIndex === 0 ? { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(167,139,250,.18)' }, { offset: 1, color: 'rgba(167,139,250,0)' }] } } : undefined
        }));
        instance.setOption(baseLineOption(hours, series, 0, 100), true);
    }

    function renderOverviewRegion() {
        const data = regionData(state.overviewLayer);
        const regionalSnapshot = calculateOverviewSnapshot(state.selectedRegion);
        const value = state.overviewLayer === 'comprehensive'
            ? regionalSnapshot.overall
            : data.find((item) => item.name === state.selectedRegion)?.value || 68;
        const level = riskLevel(value);
        const rainValue = rainValues().find((item) => item.name === state.selectedRegion)?.value || Math.round(value * .64);
        const highSegments = PIPELINE_SEGMENTS.filter((segment) => segment.region === state.selectedRegion && segment.score >= 80).length;
        const crossingZones = COUPLING_ZONES.filter((zone) => zone.region === state.selectedRegion);
        $('#overview-selected-region').textContent = state.selectedRegion;
        $('#overview-region-detail').innerHTML = `<div class="region-detail">
            <div class="region-risk-head"><strong>${state.selectedRegion}综合研判</strong><span class="risk-pill ${level.key}">${level.label}</span></div>
            <div class="region-score"><span>${state.overviewLayer === 'comprehensive' ? '区域综合风险指数' : `${layerLabel(state.overviewLayer)}`}</span><strong>${value.toFixed(1)}</strong></div>
            <div class="mini-metric-list">
                <div class="mini-metric"><small>预测降雨</small><strong>${rainValue} mm/h</strong></div>
                <div class="mini-metric"><small>高风险管段</small><strong>${highSegments} 条</strong></div>
                <div class="mini-metric"><small>重点交叉区域</small><strong>${crossingZones.length} 处</strong></div>
                <div class="mini-metric"><small>待处置预警</small><strong>${alerts.filter((a) => a.region === state.selectedRegion && a.status !== 'closed').length} 条</strong></div>
            </div>
            <div class="judgement-box">${value >= 80 ? '短临降雨与管网异常共同推高区域风险，建议提升交叉区域监测频率并核查重点管段。' : value >= 60 ? '区域存在局部风险升高，建议关注预测降雨变化和压力、位移等关键指标。' : '当前区域整体运行平稳，保持常态监测。'}</div>
        </div>`;
    }

    function renderAlertPreview() {
        const allActive = alerts.filter((item) => item.status !== 'closed');
        const previewItems = allActive.slice(0, 6);
        $('#nav-alert-count').textContent = allActive.length;
        $('#preview-alert-count').textContent = allActive.length;
        $('#alert-preview-list').innerHTML = previewItems.map((item) => {
            const levelColor = item.level === 'red' ? '#ff4f64' : item.level === 'orange' ? '#ff902e' : '#f7c948';
            return `<div class="alert-preview" data-open-alert="${item.id}" style="--alert-color:${levelColor}">
                <div class="alert-preview-top"><strong>${DOMAIN_META[item.type].label} · ${item.region}</strong><time>${item.time}</time></div>
                <p>${item.condition}</p>
            </div>`;
        }).join('');
    }

    function rainValues() {
        const horizonFactor = { 0: 0, 30: 7, 60: 12, 120: 4 }[state.rainHorizon] || 0;
        return REGION_NAMES.map((name, index) => ({
            name,
            value: clamp(Math.round(BASE_RISK.rain[index] * 0.72 + horizonFactor + Math.sin(index * 1.6) * 4), 4, 82)
        }));
    }

    function renderRain() {
        const stageLabel = state.rainHorizon === 0 ? '当前实况' : `未来${state.rainHorizon}分钟预测`;
        $('#rain-stage-label').textContent = stageLabel;
        $('#rain-valid-time').textContent = `有效时间 ${currentTime(state.rainHorizon)}`;
        renderKpis('rain-kpis', [
            ['短临降雨风险', calculateRainScore().toFixed(1), '', '强度35% · 预测35% · 其他30%', 'fa-cloud-rain', 'up', '#36c6ff'],
            ['最大降雨强度', state.rainHorizon === 0 ? '46.8' : state.rainHorizon === 60 ? '61.2' : '52.7', 'mm/h', '房山区西南部', 'fa-cloud-showers-water', 'up', '#36c6ff'],
            ['短临预测峰值', '61.2', 'mm/h', '预计11:28出现', 'fa-chart-line', 'up', '#72a6ff'],
            ['受影响区域', '7', '个', '3个区域风险较高', 'fa-map-location-dot', 'up', '#ff902e'],
            ['关联管网点位', '28', '处', '含9处交叉点', 'fa-code-branch', 'up', '#a78bfa'],
            ['降雨预警', '5', '条', '橙色2 · 黄色3', 'fa-bell', 'steady', '#ff4f64']
        ], '#36c6ff');

        const data = rainValues();
        const mapData = state.rainLayer === 'risk'
            ? data.map((item) => ({ ...item, value: Math.round(item.value * 1.28) }))
            : state.rainLayer === 'impact'
                ? data.map((item) => ({ ...item, value: Math.round(item.value * 1.05 + 12) }))
                : data;
        setMap('rain-map', mapData, {
            metricLabel: state.rainLayer === 'intensity' ? '降雨强度' : state.rainLayer === 'risk' ? '降雨风险指数' : '管网影响指数',
            unit: state.rainLayer === 'intensity' ? ' mm/h' : '', max: state.rainLayer === 'intensity' ? 80 : 100,
            colors: ['#103c73', '#1d8dca', '#35d0d0', '#f7c948', '#ff5f5f']
        });
        renderRainRanking();
        renderRainTrend();
        renderRainImpact();
    }

    function renderRainRanking(selectedName) {
        const data = rainValues().sort((a, b) => b.value - a.value).slice(0, 7);
        $('#rain-ranking').innerHTML = data.map((item, index) => {
            const level = item.value >= 50 ? '橙色' : item.value >= 30 ? '黄色' : '关注';
            return `<div class="rain-rank-item" data-rain-region="${item.name}" ${selectedName === item.name ? 'style="border-color:#36c6ff"' : ''}>
                <div class="rain-rank-top"><strong>${index + 1}. ${item.name}</strong><b>${item.value}<small> mm/h</small></b></div>
                <div class="rain-rank-meta"><span>${level}风险 · ${Math.max(1, Math.round(item.value / 12))}处管网点位受影响</span><span>${item.value >= 50 ? '增强' : '平稳'}</span></div>
            </div>`;
        }).join('');
    }

    function renderRainTrend() {
        const instance = chart('rain-trend');
        if (!instance) return;
        const labels = ['08:00', '08:30', '09:00', '09:30', '10:00', '现在', '+30', '+60', '+90', '+120'];
        const observed = [8, 12, 18, 24, 29, 34, null, null, null, null];
        const forecast = [null, null, null, null, null, 34, 43, 57, 49, 38];
        instance.setOption({
            ...baseLineOption(labels, [
                { name: '实况降雨', type: 'line', smooth: true, showSymbol: true, symbolSize: 5, data: observed, lineStyle: { color: '#36c6ff', width: 2 }, itemStyle: { color: '#36c6ff' }, areaStyle: { color: 'rgba(54,198,255,.08)' } },
                { name: '预测降雨', type: 'line', smooth: true, showSymbol: true, symbolSize: 5, data: forecast, lineStyle: { color: '#36c6ff', width: 2, type: 'dashed' }, itemStyle: { color: '#9ee9ff' } }
            ], 0, 70),
            series: [
                { name: '实况降雨', type: 'line', smooth: true, showSymbol: true, symbolSize: 5, data: observed, lineStyle: { color: '#36c6ff', width: 2 }, itemStyle: { color: '#36c6ff' }, areaStyle: { color: 'rgba(54,198,255,.08)' }, markLine: { silent: true, data: [{ yAxis: 50, name: '橙色阈值' }], lineStyle: { color: '#ff902e', type: 'dashed' }, label: { color: '#ffc184', fontSize: vf(11) } } },
                { name: '预测降雨', type: 'line', smooth: true, showSymbol: true, symbolSize: 5, data: forecast, lineStyle: { color: '#36c6ff', width: 2, type: 'dashed' }, itemStyle: { color: '#9ee9ff' } }
            ]
        }, true);
    }

    function renderRainImpact() {
        $('#rain-impact-chain').innerHTML = [
            ['fa-cloud-showers-heavy', '强降雨'], ['fa-water', '土体含水升高'], ['fa-arrows-down-to-line', '地表位移'], ['fa-route', '管线受力变化'], ['fa-triangle-exclamation', '耦合预警']
        ].map(([icon, label], index, array) => `<div class="impact-node"><i class="fa-solid ${icon}"></i><span>${label}</span></div>${index < array.length - 1 ? '<i class="fa-solid fa-chevron-right impact-arrow"></i>' : ''}`).join('');
        $('#rain-impact-summary').innerHTML = `<strong>研判结论：</strong>未来${state.rainHorizon || 60}分钟房山区、门头沟区降雨风险较高，预计影响9处管网交叉点。建议重点关注地表位移持续上升区域，并同步核查供水压力与燃气浓度异常。`;
    }

    function renderPipeline() {
        const config = PIPELINE_CONFIGS[state.pipeline];
        $('#pipeline-eyebrow').textContent = config.eyebrow;
        $('#pipeline-eyebrow').style.color = config.color;
        $('#pipeline-title').textContent = config.title;
        $('#pipeline-description').textContent = config.description;
        $('#pipeline-map-title').textContent = config.mapTitle;
        $('#pipeline-trend-title').textContent = config.trendTitle;
        $('#pipeline-chain-title').textContent = config.chainTitle;
        $$('.pipeline-switch button').forEach((button) => button.classList.toggle('active', button.dataset.page === state.pipeline));
        renderKpis('pipeline-kpis', config.kpis.map((item) => [...item, config.color]), config.color);
        setMap('pipeline-map', regionData(state.pipeline), { metricLabel: `${DOMAIN_META[state.pipeline].label}风险指数` });
        renderPipelineRegion();
        renderPipelineTrend();
        renderPipelineFactors();
        renderPipelineChain();
    }

    function renderPipelineRegion() {
        const config = PIPELINE_CONFIGS[state.pipeline];
        const value = regionData(state.pipeline).find((item) => item.name === state.selectedRegion)?.value || 68;
        const level = riskLevel(value);
        $('#pipeline-selected-region').textContent = state.selectedRegion;
        $('#pipeline-region-detail').innerHTML = `<div class="region-detail">
            <div class="region-risk-head"><strong>${state.selectedRegion}${DOMAIN_META[state.pipeline].label}</strong><span class="risk-pill ${level.key}">${level.label}</span></div>
            <div class="region-score"><span>专项风险指数</span><strong style="color:${config.color}">${value.toFixed(1)}</strong></div>
            <div class="mini-metric-list">${config.metrics.map(([label, metricValue]) => `<div class="mini-metric"><small>${label}</small><strong>${metricValue}</strong></div>`).join('')}</div>
            <div class="judgement-box" style="border-left-color:${config.color}">${value >= 80 ? `该区域${DOMAIN_META[state.pipeline].label}风险较高，主要风险贡献来自${config.factors[0][0]}和${config.factors[1][0]}，建议优先现场核查。` : `当前区域${DOMAIN_META[state.pipeline].label}整体可控，建议持续关注${config.factors[0][0]}相关监测指标。`}</div>
            <button class="primary-btn" style="width:100%;margin-top:12px" data-page="alerts"><i class="fa-solid fa-bell"></i>查看相关预警</button>
        </div>`;
    }

    function renderPipelineTrend() {
        const config = PIPELINE_CONFIGS[state.pipeline];
        const instance = chart('pipeline-trend');
        if (!instance) return;
        const count = state.pipelineRange === 24 ? 24 : state.pipelineRange === 72 ? 18 : 21;
        const labels = Array.from({ length: count }, (_, i) => state.pipelineRange === 24 ? `${pad(i)}:00` : state.pipelineRange === 72 ? `${Math.floor(i / 6) + 1}日 ${pad((i % 6) * 4)}时` : `第${i + 1}时段`);
        const series = config.series.map((item, seriesIndex) => ({
            name: item.name, type: 'line', smooth: true, showSymbol: false,
            data: labels.map((_, i) => Number((item.base + Math.sin(i / 2.7 + seriesIndex) * item.amp + Math.cos(i / 5) * item.amp * .35).toFixed(item.base > 100 ? 0 : 2))),
            lineStyle: { width: 2, color: item.color }, itemStyle: { color: item.color },
            yAxisIndex: (config.series.length === 2 && seriesIndex === 1) || (config.series.length === 3 && seriesIndex === 2) ? 1 : 0
        }));
        const option = baseLineOption(labels, series);
        if (config.series.length >= 2) option.yAxis = [axisStyle(), { ...axisStyle(), position: 'right' }];
        instance.setOption(option, true);
    }

    function renderPipelineFactors() {
        const config = PIPELINE_CONFIGS[state.pipeline];
        const instance = chart('pipeline-factors');
        if (!instance) return;
        instance.setOption({
            grid: { left: 126, right: 38, top: 25, bottom: 34 },
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#071a34', borderColor: '#2f6d9f', textStyle: { color: '#fff', fontSize: vf(12) } },
            xAxis: { type: 'value', max: 100, axisLabel: { color: '#a8bfd5', fontSize: vf(10) }, splitLine: { lineStyle: { color: 'rgba(142,175,205,.14)' } } },
            yAxis: { type: 'category', inverse: true, data: config.factors.map((item) => item[0]), axisLabel: { color: '#e0ecf7', fontSize: vf(12), margin: 14 }, axisLine: { show: false }, axisTick: { show: false } },
            series: [{ type: 'bar', barWidth: 12, data: config.factors.map((item) => item[1]), itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: config.color }, { offset: 1, color: '#a78bfa' }] }, borderRadius: [0, 6, 6, 0] }, label: { show: true, position: 'right', color: '#e2edf7', fontSize: vf(11) } }]
        }, true);
    }

    function renderPipelineChain(activeIndex = 0) {
        const config = PIPELINE_CONFIGS[state.pipeline];
        $('#pipeline-risk-chain').innerHTML = config.chain.map(([icon, title, subtitle], index) => `<button class="chain-node ${index === activeIndex ? 'active' : ''}" data-chain-index="${index}" style="--chain-color:${config.color}"><i class="fa-solid ${icon}"></i><span><strong>${title}</strong><small>${subtitle}</small></span></button>${index < config.chain.length - 1 ? '<i class="fa-solid fa-chevron-right chain-arrow"></i>' : ''}`).join('');
        $('#pipeline-chain-explanation').style.borderLeftColor = config.color;
        $('#pipeline-chain-explanation').innerHTML = `<strong>${config.chain[activeIndex][1]}：</strong>${config.chain[activeIndex][3]}`;
    }

    function renderCoupling() {
        $('#coupling-zone-tabs').innerHTML = COUPLING_ZONES.map((zone) => `<button class="zone-tab ${zone.id === state.couplingZone.id ? 'active' : ''}" data-zone-id="${zone.id}"><span><strong>${zone.name}</strong><small>${zone.region} · ${zone.id}</small></span><b>${zone.score}</b></button>`).join('');
        const zone = state.couplingZone;
        const topZone = COUPLING_ZONES.reduce((top, item) => item.score > top.score ? item : top, COUPLING_ZONES[0]);
        $('#coupling-top-zone').textContent = topZone.name;
        $('#coupling-top-score').textContent = topZone.score;
        $('#coupling-zone-code').textContent = zone.id;
        $('#coupling-factor-value').textContent = zone.factor.toFixed(2);

        const mapData = regionData('comprehensive').map((item) => ({ ...item, value: item.name === zone.region ? Math.round(zone.score) : Math.round(item.value * .86) }));
        setMap('coupling-map', mapData, { metricLabel: '耦合风险指数', selectedName: zone.region });

        const systems = [
            ['短临降雨', zone.rain, '#36c6ff', 'fa-cloud-showers-heavy'], ['燃气管网', zone.gas, '#f3a33b', 'fa-fire-flame-simple'],
            ['供水管网', zone.water, '#28a9ff', 'fa-droplet'], ['供热管网', zone.heat, '#ff6b63', 'fa-temperature-high']
        ];
        $('#coupling-system-scores').innerHTML = systems.map(([label, value, color, icon]) => `<div class="system-score-item"><div class="system-score-head"><span><i class="fa-solid ${icon}" style="color:${color}"></i>${label}</span><b style="color:${color}">${value}</b></div><div class="system-score-bar"><span style="width:${value}%;background:${color}"></span></div></div>`).join('');
        renderRelationMatrix();
        renderPropagation();
    }

    function selectCouplingZone(id) {
        const zone = COUPLING_ZONES.find((item) => item.id === id);
        if (!zone) return;
        state.couplingZone = zone;
        state.selectedRegion = zone.region;
        renderCoupling();
    }

    function renderRelationMatrix(activeKey = 'rain-gas') {
        const rows = ['短临降雨', '燃气系统', '供水系统', '供热系统'];
        const columns = ['燃气系统', '供水系统', '供热系统'];
        const relations = {
            'rain-gas': '降雨引发土体含水与地表位移变化，可能增加燃气管道受力和泄漏风险。',
            'rain-water': '持续降雨、地表积水与土体冲刷可能影响供水管道基础稳定性。',
            'rain-heat': '降雨与地表位移可能作用于热力管线和补偿结构，增加泄漏概率。',
            'gas-gas': '同一系统内部关联', 'gas-water': '燃气抢修开挖可能影响邻近供水设施，供水条件也会影响抢修保障。', 'gas-heat': '燃气供应异常可能影响部分热源，同时交叉敷设增加联合抢修复杂度。',
            'water-gas': '供水泄漏可能冲刷燃气管线周边土体，使燃气管段发生位移或悬空。', 'water-water': '同一系统内部关联', 'water-heat': '供水系统是供热补水和传热介质保障，故障可能影响供热运行。',
            'heat-gas': '热力泄漏和抢修作业可能影响邻近燃气设施。', 'heat-water': '高温介质泄漏及抢修可能影响邻近供水管段。', 'heat-heat': '同一系统内部关联'
        };
        const keys = ['gas', 'water', 'heat'];
        let html = '<div class="matrix-cell matrix-head">影响源 / 对象</div>' + columns.map((name) => `<div class="matrix-cell matrix-head">${name}</div>`).join('');
        rows.forEach((row, rowIndex) => {
            const source = ['rain', 'gas', 'water', 'heat'][rowIndex];
            html += `<div class="matrix-cell matrix-head">${row}</div>`;
            keys.forEach((target) => {
                const key = `${source}-${target}`;
                const self = source === target;
                html += self ? '<div class="matrix-cell matrix-empty">—</div>' : `<button class="matrix-cell ${key === activeKey ? 'active' : ''}" data-relation-key="${key}" data-relation-text="${escapeHtml(relations[key])}">${source === 'rain' ? '布设/环境影响' : source === 'water' && target === 'heat' ? '功能型影响' : source === 'gas' && target === 'heat' ? '功能/恢复影响' : '恢复/布设影响'}</button>`;
            });
        });
        $('#relation-matrix').innerHTML = html;
        const active = $(`[data-relation-key="${activeKey}"]`);
        if (active) $('#relation-detail').innerHTML = `<strong>关系研判：</strong>${active.dataset.relationText}`;
    }

    function renderPropagation() {
        const zone = state.couplingZone;
        $('#propagation-chain').innerHTML = [
            ['短临降雨增强', `${zone.region}预测风险 ${zone.rain}`], ['土体含水与位移变化', '外部扰动传导至交叉敷设区'],
            ['单系统指标异常', `燃气 ${zone.gas} · 供水 ${zone.water} · 供热 ${zone.heat}`], ['风险耦合放大', `放大系数 ${zone.factor.toFixed(2)}`], ['联合预警与处置', `综合风险 ${zone.score}`]
        ].map(([title, detail], index) => `<div class="propagation-step"><b>${index + 1}</b><span>${title}</span><small>${detail}</small></div>`).join('');
        $('#relation-detail').innerHTML = `<strong>当前结论：</strong>${zone.name}受降雨和多管网空间邻近共同影响，综合风险达到${zone.score}。建议优先核查供水压力、燃气浓度和地表位移，并做好联合巡检准备。`;
    }

    function renderAlerts() {
        const active = alerts.filter((item) => item.status !== 'closed');
        renderKpis('alert-kpis', [
            ['今日预警', String(alerts.length), '条', '较昨日 +2', 'fa-bell', 'up', '#ff902e'],
            ['红色预警', String(alerts.filter((a) => a.level === 'red' && a.status !== 'closed').length), '条', '均已进入处置流程', 'fa-circle-exclamation', 'up', '#ff4f64'],
            ['待确认', String(alerts.filter((a) => a.status === 'pending').length), '条', '最早等待6分钟', 'fa-hourglass-half', 'up', '#f7c948'],
            ['处置中', String(alerts.filter((a) => ['processing', 'assigned'].includes(a.status)).length), '条', '3个处置小组在线', 'fa-person-digging', 'steady', '#36c6ff'],
            ['今日闭环率', `${Math.round(alerts.filter((a) => a.status === 'closed').length / alerts.length * 100)}`, '%', `${active.length}条仍在跟踪`, 'fa-circle-check', 'up', '#2dd4a3']
        ]);
        renderAlertTable();
        renderRules();
        renderTimeline();
        renderAlertPreview();
    }

    function renderAlertTable() {
        const type = $('#alert-type-filter').value;
        const level = $('#alert-level-filter').value;
        const status = $('#alert-status-filter').value;
        const keyword = $('#alert-search').value.trim().toLowerCase();
        const filtered = alerts.filter((item) => {
            const matchesKeyword = !keyword || `${item.id}${item.region}${item.object}${item.condition}`.toLowerCase().includes(keyword);
            return (type === 'all' || item.type === type) && (level === 'all' || item.level === level) && (status === 'all' || item.status === status) && matchesKeyword;
        });
        const levelNames = { red: '红色', orange: '橙色', yellow: '黄色' };
        const statusNames = { pending: '待确认', processing: '处置中', assigned: '已派单', closed: '已关闭' };
        $('#alert-table-body').innerHTML = filtered.length ? filtered.map((item) => `<tr>
            <td><span class="level-pill ${item.level}">${levelNames[item.level]}</span></td>
            <td><div class="alert-id"><strong>${item.id}</strong><small><span class="type-pill ${item.type}">${DOMAIN_META[item.type].label}</span></small></div></td>
            <td><div class="alert-location"><strong>${item.region}</strong><small>${item.object}</small></div></td>
            <td>${item.condition}</td><td>${item.time}</td><td><span class="status-pill ${item.status}">${statusNames[item.status]}</span></td>
            <td><div class="row-actions">${item.status === 'pending' ? `<button data-alert-action="confirm" data-alert-id="${item.id}">确认</button>` : ''}${!['assigned', 'closed'].includes(item.status) ? `<button data-alert-action="assign" data-alert-id="${item.id}">派单</button>` : ''}${item.status !== 'closed' ? `<button data-alert-action="close" data-alert-id="${item.id}">关闭</button>` : `<button data-alert-action="detail" data-alert-id="${item.id}">详情</button>`}</div></td>
        </tr>`).join('') : '<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i>没有符合当前条件的预警</div></td></tr>';
        $('#alert-result-count').textContent = `共 ${filtered.length} 条记录`;
    }

    function handleAlertAction(action, id) {
        const item = alerts.find((alert) => alert.id === id);
        if (!item) return;
        if (action === 'detail') {
            openAlertDetail(item);
            return;
        }
        const statusMap = { confirm: 'processing', assign: 'assigned', close: 'closed' };
        item.status = statusMap[action] || item.status;
        const actionName = { confirm: '已确认并进入处置', assign: '已派发联合巡检任务', close: '已完成关闭' }[action];
        showToast('预警状态已更新', `${item.id} ${actionName}`, 'success');
        renderAlerts();
    }

    function renderRules() {
        $('#rule-count').textContent = `${rules.length} 条`;
        $('#rule-list').innerHTML = rules.map((rule) => `<div class="rule-item"><div><strong>${escapeHtml(rule.name)}</strong><p><span class="type-pill ${rule.type}">${DOMAIN_META[rule.type].label}</span> ${escapeHtml(rule.metric)} ${escapeHtml(rule.threshold)} · ${escapeHtml(rule.condition || '无附加条件')}</p></div><div class="rule-actions"><label class="switch" title="启用/停用"><input type="checkbox" data-rule-toggle="${rule.id}" ${rule.enabled ? 'checked' : ''}><span></span></label><button data-rule-delete="${rule.id}" title="删除规则"><i class="fa-solid fa-trash-can"></i></button></div></div>`).join('');
    }

    function renderTimeline() {
        $('#event-timeline').innerHTML = timelineEvents.map(([time, title, detail]) => `<div class="timeline-event"><time>${time}</time><strong>${title}</strong><p>${detail}</p></div>`).join('');
    }

    function renderHistory() {
        renderHistoryTrend();
        renderRegionCompare();
        renderAlertStats();
    }

    function historyLabels(count) {
        if (state.historyPeriod === 24) return Array.from({ length: count }, (_, i) => `${pad(i)}:00`);
        if (state.historyPeriod === 168) return ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        return Array.from({ length: count }, (_, i) => `${i + 1}日`);
    }

    function renderHistoryTrend() {
        const instance = chart('history-trend');
        if (!instance) return;
        const metric = $('#history-metric').value;
        const metricLabel = $('#history-metric').selectedOptions[0].textContent;
        const periodName = state.historyPeriod === 24 ? '24小时' : state.historyPeriod === 168 ? '近7天' : '近30天';
        $('#history-trend-title').textContent = `${periodName}${metricLabel}趋势`;
        const count = state.historyPeriod === 24 ? 24 : state.historyPeriod === 168 ? 7 : 30;
        const labels = historyLabels(count);
        const domains = [
            ['短临降雨', '#36c6ff', 52, 18], ['燃气', '#f3a33b', 62, 11], ['供水', '#28a9ff', 58, 9], ['供热', '#ff6b63', 56, 8]
        ];
        const metricScale = metric === 'rain' ? 0.75 : metric === 'gas' ? 0.9 : metric === 'water' ? 0.68 : metric === 'heat' ? 1.04 : 1;
        const series = domains.map(([name, color, base, amp], index) => ({ name, type: 'line', smooth: true, showSymbol: count <= 7, data: labels.map((_, i) => Math.round((base + Math.sin(i / 2 + index) * amp + Math.cos(i / 5) * 3) * metricScale)), lineStyle: { color, width: 2 }, itemStyle: { color } }));
        instance.setOption(baseLineOption(labels, series), true);
    }

    function renderRegionCompare() {
        const instance = chart('history-region-compare');
        if (!instance) return;
        const data = regionData('comprehensive').sort((a, b) => b.value - a.value).slice(0, 8);
        instance.setOption({
            grid: { left: 65, right: 24, top: 20, bottom: 22 },
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#071a34', borderColor: '#2f6d9f', textStyle: { color: '#fff', fontSize: vf(12) } },
            xAxis: { type: 'value', max: 100, axisLabel: { color: '#a8bfd5', fontSize: vf(10) }, splitLine: { lineStyle: { color: 'rgba(142,175,205,.14)' } } },
            yAxis: { type: 'category', inverse: true, data: data.map((item) => item.name), axisLabel: { color: '#dce9f5', fontSize: vf(11) }, axisLine: { show: false }, axisTick: { show: false } },
            series: [{ type: 'bar', barWidth: 12, data: data.map((item) => ({ value: item.value, itemStyle: { color: item.value >= 80 ? '#ff4f64' : item.value >= 60 ? '#ff902e' : '#36c6ff', borderRadius: [0, 6, 6, 0] } })), label: { show: true, position: 'right', color: '#dce9f5', fontSize: vf(11) } }]
        }, true);
    }

    function renderAlertStats() {
        const instance = chart('history-alert-stats');
        if (!instance) return;
        instance.setOption({
            tooltip: { trigger: 'item', backgroundColor: '#071a34', borderColor: '#2f6d9f', textStyle: { color: '#fff', fontSize: vf(12) } },
            legend: { bottom: 13, textStyle: { color: '#bfd2e4', fontSize: vf(11) }, itemWidth: 11, itemHeight: 7 },
            series: [{ type: 'pie', radius: ['45%', '67%'], center: ['50%', '43%'], label: { show: true, formatter: '{c}', color: '#f1f7fd', fontSize: vf(12) }, data: [
                { name: '降雨', value: 18, itemStyle: { color: '#36c6ff' } }, { name: '燃气', value: 13, itemStyle: { color: '#f3a33b' } },
                { name: '供水', value: 11, itemStyle: { color: '#28a9ff' } }, { name: '供热', value: 8, itemStyle: { color: '#ff6b63' } }, { name: '耦合', value: 6, itemStyle: { color: '#a78bfa' } }
            ] }]
        }, true);
    }

    function axisStyle() {
        return { type: 'value', axisLabel: { color: '#a7bfd6', fontSize: vf(10) }, splitLine: { lineStyle: { color: 'rgba(142,175,205,.14)' } }, axisLine: { show: false }, axisTick: { show: false } };
    }

    function baseLineOption(labels, series, min, max) {
        const yAxis = axisStyle();
        if (min !== undefined) yAxis.min = min;
        if (max !== undefined) yAxis.max = max;
        return {
            color: series.map((item) => item.lineStyle?.color || item.itemStyle?.color),
            grid: { left: 42, right: 28, top: 30, bottom: 26 },
            tooltip: { trigger: 'axis', backgroundColor: 'rgba(5,22,46,.96)', borderColor: 'rgba(72,164,255,.45)', textStyle: { color: '#f2f8ff', fontSize: vf(12) } },
            legend: { top: 10, right: 20, textStyle: { color: '#bfd2e4', fontSize: vf(11) }, itemWidth: 18, itemHeight: 7 },
            xAxis: { type: 'category', boundaryGap: false, data: labels, axisLabel: { color: '#a8bfd5', fontSize: vf(10), hideOverlap: true }, axisLine: { lineStyle: { color: 'rgba(142,175,205,.24)' } }, axisTick: { show: false } },
            yAxis,
            series
        };
    }

    function showPage(page) {
        if (!PAGE_TITLES[page]) return;
        state.page = page;
        if (['gas', 'water', 'heat'].includes(page)) state.pipeline = page;
        $$('.page-view').forEach((view) => view.classList.remove('active'));
        const target = ['gas', 'water', 'heat'].includes(page) ? $('#page-pipeline') : $(`#page-${page}`);
        if (target) target.classList.add('active');
        $$('.main-nav > .nav-link[data-page]').forEach((button) => button.classList.toggle('active', button.dataset.page === page));
        $('.nav-dropdown').classList.toggle('active', ['gas', 'water', 'heat'].includes(page));
        $('#pipeline-nav span').textContent = ['gas', 'water', 'heat'].includes(page) ? PAGE_TITLES[page] : '管网专题';
        $('#context-title').textContent = PAGE_TITLES[page];
        document.title = `${PAGE_TITLES[page]} | 广域立体风险感知平台`;
        if (location.hash !== `#${page}`) history.replaceState(null, '', `#${page}`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(renderActivePage, 30);
        closeDropdown();
    }

    function renderActivePage() {
        if (state.page === 'overview') renderOverview();
        else if (state.page === 'rain') renderRain();
        else if (['gas', 'water', 'heat'].includes(state.page)) renderPipeline();
        else if (state.page === 'coupling') renderCoupling();
        else if (state.page === 'alerts') renderAlerts();
        else if (state.page === 'history') renderHistory();
        else if (state.page === 'data') renderDataSources();
        setTimeout(resizeCharts, 60);
    }

    function renderDataSources() {
        if (window.monitoringRefresh) { window.monitoringRefresh(); return; }
        const body = $('#data-source-body');
        if (!body) return;
        const filter = $('#data-source-filter')?.value || 'all';
        const sources = DATA_SOURCES.filter((source) => filter === 'all' || source.status === filter);
        body.innerHTML = sources.map((source, index) => `<tr>
            <td><span class="source-name"><i class="fa-solid ${source.icon}"></i><strong>${source.name}</strong></span></td>
            <td>${source.type}</td><td><span class="protocol-tag">${source.protocol}</span></td><td>${source.frequency}</td><td>${source.arrived}</td><td>${source.completeness}</td>
            <td><span class="source-status ${source.status}">${source.status === 'online' ? '在线' : '降级'}</span></td>
            <td><button class="text-btn" data-source-index="${DATA_SOURCES.indexOf(source)}">查看详情</button></td>
        </tr>`).join('') || '<tr><td colspan="8" class="source-empty">当前筛选条件下暂无数据源</td></tr>';
    }

    function openDataSourceDetail(index) {
        const source = DATA_SOURCES[index];
        if (!source) return;
        openModal(`${source.name} · 接入详情`, `<div class="evidence-grid">
            <div class="evidence-card"><strong>数据类型</strong><span>${source.type}</span><small>根据数据形态进入对应处理通道</small></div>
            <div class="evidence-card"><strong>接入协议</strong><span>${source.protocol}</span><small>当前为前端模拟接入状态</small></div>
            <div class="evidence-card"><strong>更新频率</strong><span>${source.frequency}</span><small>最后到达：${source.arrived}</small></div>
            <div class="evidence-card"><strong>数据完整率</strong><span>${source.completeness}</span><small>质量状态：${source.status === 'online' ? '正常' : '存在延迟异常'}</small></div>
        </div><h3>预处理流程</h3><p>格式校验 → 单位转换 → 时间戳对齐 → 异常值检测 → 分类汇聚。正式版本可在此继续展示接口地址、字段映射和质量规则。</p>`);
    }

    function openModal(title, html) {
        $('#modal-title').textContent = title;
        $('#modal-body').innerHTML = html;
        $('#detail-modal').classList.add('open');
        $('#detail-modal').setAttribute('aria-hidden', 'false');
    }

    function closeModal() {
        $('#detail-modal').classList.remove('open');
        $('#detail-modal').setAttribute('aria-hidden', 'true');
    }

    function openOverviewDetail(detailKey) {
        const snapshot = calculateOverviewSnapshot();
        const overviewWeights = weightConfig.overview;
        const rainWeights = weightConfig.rain;
        const editButton = state.isAdmin ? '<button class="soft-btn" data-open-weight-config><i class="fa-solid fa-sliders"></i>管理员调整权重</button>' : '';
        const componentRows = [
            ['短临降雨风险', snapshot.components.rain, '短临降雨模块', `${Math.round(overviewWeights.rain * 100)}%`],
            ['燃气管网风险', snapshot.components.gas, '燃气管网专题', `${Math.round(overviewWeights.gas * 100)}%`],
            ['供水管网风险', snapshot.components.water, '供水管网专题', `${Math.round(overviewWeights.water * 100)}%`],
            ['供热管网风险', snapshot.components.heat, '供热管网专题', `${Math.round(overviewWeights.heat * 100)}%`],
            ['多系统耦合风险', snapshot.components.coupling, '耦合研判模块', `${Math.round(overviewWeights.coupling * 100)}%`]
        ];
        if (detailKey === 'overall') {
            openModal('综合风险指数 · 计算明细', `<p>当前综合风险指数由五类风险按配置权重计算，所有分值统一归一化到0～100。</p><div class="evidence-grid">${componentRows.map(([name, value, source, weight]) => `<div class="evidence-card"><strong>${name}</strong><span>${value.toFixed(1)} × ${weight}</span><small>来源：${source}</small></div>`).join('')}</div><h3>计算公式</h3><p>综合风险 = ${WEIGHT_LABELS.overview.rain}×${Math.round(overviewWeights.rain * 100)}% + ${WEIGHT_LABELS.overview.gas}×${Math.round(overviewWeights.gas * 100)}% + ${WEIGHT_LABELS.overview.water}×${Math.round(overviewWeights.water * 100)}% + ${WEIGHT_LABELS.overview.heat}×${Math.round(overviewWeights.heat * 100)}% + ${WEIGHT_LABELS.overview.coupling}×${Math.round(overviewWeights.coupling * 100)}% = <strong>${snapshot.overall.toFixed(1)}</strong></p><h3>风险等级</h3><p>0～59低风险，60～79中风险，80～100高风险。当前数据为模拟值，后续由综合风险计算服务替换。</p>${editButton}`);
            return;
        }
        if (detailKey === 'rain') {
            const rainRows = [
                ['当前降雨强度风险', RAIN_MODEL.intensity, '雨量站/雷达实况', `${Math.round(rainWeights.intensity * 100)}%`],
                ['未来60分钟预测风险', RAIN_MODEL.forecast, '短临降雨预测模型', `${Math.round(rainWeights.forecast * 100)}%`],
                ['降雨概率风险', RAIN_MODEL.probability, '预测概率产品', `${Math.round(rainWeights.probability * 100)}%`],
                ['累计降雨风险', RAIN_MODEL.cumulative, '1～6小时累计雨量', `${Math.round(rainWeights.cumulative * 100)}%`],
                ['管网暴露风险', RAIN_MODEL.exposure, '雨区与管线空间叠加', `${Math.round(rainWeights.exposure * 100)}%`]
            ];
            openModal('短临降雨风险 · 计算明细', `<p>短临降雨风险综合当前实况、未来60分钟预测、降雨概率、累计雨量和地下管网暴露程度。</p><div class="evidence-grid">${rainRows.map(([name, value, source, weight]) => `<div class="evidence-card"><strong>${name}</strong><span>${value} × ${weight}</span><small>来源：${source}</small></div>`).join('')}</div><h3>计算结果</h3><p>短临降雨风险 = ${calculateRainScore().toFixed(1)}，当前为模拟数据，进入短临降雨模块后可查看分区和时间轴。</p>${editButton}<button class="primary-btn" data-page="rain"><i class="fa-solid fa-cloud-rain"></i>进入短临降雨模块</button>`);
            return;
        }
        if (detailKey === 'pipeline') {
            const breakdown = ['gas', 'water', 'heat'].map((type) => ({ type, segments: pipelineSegmentsByType(type).filter((segment) => segment.status === 'active' && segment.score >= 80) }));
            openModal('高风险管段 · 来源明细', `<p>统计对象为三个管网专题中“状态有效且风险分数≥80”的独立管段。当前共${snapshot.highSegments.length}条，数据来源分别为燃气、供水、供热管网专题。</p><div class="evidence-grid">${breakdown.map(({ type, segments }) => `<div class="evidence-card"><strong>${DOMAIN_META[type].label}</strong><span>${segments.length}条 · 专题风险分数 ${snapshot.components[type].toFixed(1)}</span><small>来源：${DOMAIN_META[type].label}风险评估结果</small></div>`).join('')}</div><h3>高风险管段清单（模拟）</h3><div class="detail-list">${snapshot.highSegments.map((segment) => `<div><strong>${segment.id}</strong><span>${segment.region} · ${DOMAIN_META[segment.type].label} · ${segment.score}分</span><small>${segment.factor}</small></div>`).join('')}</div><button class="primary-btn" data-page="gas"><i class="fa-solid fa-route"></i>进入管网专题查看</button>`);
            return;
        }
        if (detailKey === 'coupling') {
            openModal('重点交叉区域 · 来源明细', `<p>统计对象为耦合研判模块识别出的有效交叉区域。当前共${snapshot.activeZones.length}处，其中耦合风险达到80分的高风险区域${snapshot.highZones.length}处。</p><div class="evidence-grid"><div class="evidence-card"><strong>来源模块</strong><span>耦合研判模块</span><small>空间邻近、系统风险、相互影响和影响重要性综合计算</small></div><div class="evidence-card"><strong>统计规则</strong><span>有效交叉区全部计入</span><small>高风险阈值：耦合风险指数 ≥ 80</small></div></div><h3>交叉区域清单（模拟）</h3><div class="detail-list">${snapshot.activeZones.map((zone) => `<div><strong>${zone.name}</strong><span>${zone.region} · ${zone.score}分 · ${zone.systems}</span><small>${zone.impact}</small></div>`).join('')}</div><button class="primary-btn" data-page="coupling"><i class="fa-solid fa-link"></i>进入耦合研判模块</button>`);
        }
    }

    function weightEditorMarkup(group, weights) {
        return Object.entries(WEIGHT_LABELS[group]).map(([key, label]) => `<label class="weight-field"><span>${label}</span><div><input type="number" min="0" max="100" step="1" data-weight-group="${group}" data-weight-key="${key}" value="${Math.round(weights[key] * 100)}"><b>%</b></div></label>`).join('');
    }

    function updateWeightTotals() {
        ['overview', 'rain'].forEach((group) => {
            const total = $$(`[data-weight-group="${group}"]`).reduce((sum, input) => sum + Number(input.value || 0), 0);
            const totalElement = $(`#weight-total-${group}`);
            if (totalElement) {
                totalElement.textContent = `${total.toFixed(0)}%`;
                totalElement.classList.toggle('invalid', Math.abs(total - 100) > 0.01);
            }
        });
    }

    function fillWeightEditor(region) {
        const profile = getWeightProfile(region);
        $$('[data-weight-group]').forEach((input) => {
            input.value = Math.round(profile[input.dataset.weightGroup][input.dataset.weightKey] * 100);
        });
        updateWeightTotals();
    }

    function openWeightConfigModal() {
        if (!state.isAdmin) {
            showToast('无权修改权重', '只有管理员账号可以调整区域化风险权重。', 'warning');
            return;
        }
        const regionOptions = ['北京市', ...REGION_NAMES].map((region) => `<option value="${region}">${region}${region !== '北京市' && weightConfig.regions[region] ? ' · 已配置' : ''}</option>`).join('');
        openModal('管理员 · 风险权重配置', `<form id="weight-config-form" class="weight-config-form"><p>权重仅影响模拟风险计算。选择“北京市”修改全市默认值，选择具体行政区可建立区域化配置。每组权重必须合计100%。</p><label class="weight-region-label">配置区域<select id="weight-region-select">${regionOptions}</select></label><div class="weight-section"><div class="weight-section-head"><h3>综合风险指数权重</h3><strong id="weight-total-overview">100%</strong></div>${weightEditorMarkup('overview', getWeightProfile('北京市').overview)}</div><div class="weight-section"><div class="weight-section-head"><h3>短临降雨风险权重</h3><strong id="weight-total-rain">100%</strong></div>${weightEditorMarkup('rain', getWeightProfile('北京市').rain)}</div><div class="weight-form-actions"><button type="button" class="soft-btn" data-weight-reset>恢复默认</button><button type="submit" class="primary-btn"><i class="fa-solid fa-floppy-disk"></i>保存权重</button></div></form>`);
        const form = $('#weight-config-form');
        const regionSelect = $('#weight-region-select');
        regionSelect.addEventListener('change', () => fillWeightEditor(regionSelect.value));
        form.addEventListener('input', updateWeightTotals);
        form.addEventListener('click', (event) => {
            if (event.target.closest('[data-weight-reset]')) {
                fillWeightEditor('北京市');
                showToast('已载入默认权重', '保存后才会覆盖当前区域配置。', 'info');
            }
        });
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const groups = {};
            for (const group of ['overview', 'rain']) {
                groups[group] = {};
                $$(`[data-weight-group="${group}"]`).forEach((input) => { groups[group][input.dataset.weightKey] = Number(input.value || 0) / 100; });
                if (Math.abs(weightTotal(groups[group]) - 1) > 0.0001) {
                    showToast('权重合计必须为100%', `${group === 'overview' ? '综合风险指数' : '短临降雨风险'}当前合计为${(weightTotal(groups[group]) * 100).toFixed(0)}%。`, 'warning');
                    return;
                }
            }
            const region = regionSelect.value;
            if (region === '北京市') {
                weightConfig.overview = groups.overview;
                weightConfig.rain = groups.rain;
            } else {
                weightConfig.regions[region] = groups;
            }
            persistWeightConfig();
            closeModal();
            renderActivePage();
            showToast('权重配置已保存', `${region}的风险计算将使用新的模拟权重。`, 'success');
        });
        updateWeightTotals();
    }

    function openFactorDetail() {
        const config = PIPELINE_CONFIGS[state.pipeline];
        openModal(`${DOMAIN_META[state.pipeline].label}风险指标依据`, `<p>当前演示将研究内容中的事故树和风险因素库转换成易于研判的风险贡献排行。正式接入模型后，贡献度由评估接口返回。</p><div class="evidence-grid">${config.evidence.map((item, index) => `<div class="evidence-card"><strong>${pad(index + 1)} · ${item}</strong><span>当前模拟贡献度 ${config.factors[index]?.[1] || 45}%</span></div>`).join('')}</div><h3>展示原则</h3><ul><li>首页只呈现主要贡献因素，避免直接铺放复杂事故树。</li><li>点击指标可继续查看监测值、阈值、变化趋势与数据来源。</li><li>风险分值和权重均为演示模拟数据，不作为真实处置依据。</li></ul>`);
    }

    function openAlertDetail(item) {
        const statusNames = { pending: '待确认', processing: '处置中', assigned: '已派单', closed: '已关闭' };
        openModal(`预警详情 · ${item.id}`, `<div class="evidence-grid"><div class="evidence-card"><strong>预警类型</strong>${DOMAIN_META[item.type].label}</div><div class="evidence-card"><strong>当前状态</strong>${statusNames[item.status]}</div><div class="evidence-card"><strong>所属区域</strong>${item.region}</div><div class="evidence-card"><strong>风险对象</strong>${item.object}</div></div><h3>触发条件</h3><p>${item.condition}</p><h3>模拟研判建议</h3><p>建议值班人员核查关联监测点数据和现场状态；若异常持续，应按预案执行派单、联动巡检和影响范围确认。</p>`);
    }

    function showToast(title, message, type = 'info') {
        const icons = { success: 'fa-circle-check', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="fa-solid ${icons[type]}"></i><div><strong>${title}</strong><span>${message}</span></div>`;
        $('#toast-container').appendChild(toast);
        setTimeout(() => toast.remove(), 3600);
    }

    function toggleRainPlayback() {
        state.rainPlaying = !state.rainPlaying;
        $('#rain-play').innerHTML = `<i class="fa-solid ${state.rainPlaying ? 'fa-pause' : 'fa-play'}"></i>`;
        clearInterval(rainPlayTimer);
        if (state.rainPlaying) {
            const horizons = [0, 30, 60, 120];
            rainPlayTimer = setInterval(() => {
                const nextIndex = (horizons.indexOf(state.rainHorizon) + 1) % horizons.length;
                state.rainHorizon = horizons[nextIndex];
                $$('.forecast-horizon button').forEach((button) => button.classList.toggle('active', Number(button.dataset.horizon) === state.rainHorizon));
                renderRain();
            }, 1800);
        }
    }

    function toggleSimulation() {
        state.simulationPaused = !state.simulationPaused;
        $('#simulation-toggle').innerHTML = `<i class="fa-solid ${state.simulationPaused ? 'fa-play' : 'fa-pause'}"></i><span>${state.simulationPaused ? '继续刷新' : '暂停刷新'}</span>`;
        showToast(state.simulationPaused ? '模拟刷新已暂停' : '模拟刷新已恢复', state.simulationPaused ? '当前画面数据将保持不变。' : '页面将每6秒更新一次模拟数据。', 'info');
    }

    function applyReadabilityMode() {
        document.body.classList.toggle('readable-mode', state.readableMode);
        $('#readability-toggle').innerHTML = `<i class="fa-solid fa-font"></i><span>${state.readableMode ? '标准字号' : '大字模式'}</span>`;
        $('#readability-toggle').classList.toggle('active', state.readableMode);
    }

    function toggleReadability() {
        state.readableMode = !state.readableMode;
        localStorage.setItem('risk-platform-readable-mode', String(state.readableMode));
        applyReadabilityMode();
        renderActivePage();
        showToast(state.readableMode ? '大字模式已开启' : '已恢复标准字号', state.readableMode ? '正文、图表标签与地图标注已进一步放大。' : '页面已恢复优化后的标准字号。', 'success');
    }

    function closeDropdown() {
        $('.nav-dropdown').classList.remove('open');
        $('#pipeline-nav').setAttribute('aria-expanded', 'false');
    }

    function resizeCharts() {
        Object.values(charts).forEach((instance) => instance && instance.resize());
    }

    function updateClock() {
        const now = new Date();
        $('#clock-time').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        $('#clock-date').textContent = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}`;
    }

    function bindEvents() {
        document.addEventListener('click', (event) => {
            const weightConfigTrigger = event.target.closest('[data-open-weight-config]');
            if (weightConfigTrigger) {
                openWeightConfigModal();
                return;
            }
            const overviewDetail = event.target.closest('[data-overview-detail]');
            if (overviewDetail) {
                openOverviewDetail(overviewDetail.dataset.overviewDetail);
                return;
            }
            const mapReset = event.target.closest('[data-reset-map]');
            if (mapReset) {
                resetMapView(mapReset.dataset.resetMap);
                return;
            }
            const pageTarget = event.target.closest('[data-page]');
            if (pageTarget && pageTarget.tagName !== 'A') {
                event.preventDefault();
                closeModal();
                showPage(pageTarget.dataset.page);
                return;
            }
            const sourceDetail = event.target.closest('[data-source-index]');
            if (sourceDetail) {
                openDataSourceDetail(Number(sourceDetail.dataset.sourceIndex));
                return;
            }
            const overviewLayer = event.target.closest('[data-overview-layer]');
            if (overviewLayer) {
                state.overviewLayer = overviewLayer.dataset.overviewLayer;
                $$('.map-layer-switch button').forEach((button) => button.classList.toggle('active', button === overviewLayer));
                renderOverview();
                return;
            }
            const horizon = event.target.closest('[data-horizon]');
            if (horizon) {
                state.rainHorizon = Number(horizon.dataset.horizon);
                $$('.forecast-horizon button').forEach((button) => button.classList.toggle('active', button === horizon));
                renderRain();
                return;
            }
            const rainLayer = event.target.closest('[data-rain-layer]');
            if (rainLayer) {
                state.rainLayer = rainLayer.dataset.rainLayer;
                $$('[data-rain-layer]').forEach((button) => button.classList.toggle('active', button === rainLayer));
                renderRain();
                return;
            }
            const rainRegion = event.target.closest('[data-rain-region]');
            if (rainRegion) {
                state.selectedRegion = rainRegion.dataset.rainRegion;
                renderRainRanking(state.selectedRegion);
                setMap('rain-map', rainValues(), { metricLabel: '降雨强度', unit: ' mm/h', max: 80, selectedName: state.selectedRegion, colors: ['#103c73', '#1d8dca', '#35d0d0', '#f7c948', '#ff5f5f'] });
                showToast('区域研判已切换', `正在查看${state.selectedRegion}短临降雨风险。`, 'info');
                return;
            }
            const pipelineRange = event.target.closest('[data-pipeline-range]');
            if (pipelineRange) {
                state.pipelineRange = Number(pipelineRange.dataset.pipelineRange);
                $$('[data-pipeline-range]').forEach((button) => button.classList.toggle('active', button === pipelineRange));
                renderPipelineTrend();
                return;
            }
            const chainNode = event.target.closest('[data-chain-index]');
            if (chainNode) {
                renderPipelineChain(Number(chainNode.dataset.chainIndex));
                return;
            }
            const zoneTab = event.target.closest('[data-zone-id]');
            if (zoneTab) {
                selectCouplingZone(zoneTab.dataset.zoneId);
                return;
            }
            const relation = event.target.closest('[data-relation-key]');
            if (relation) {
                renderRelationMatrix(relation.dataset.relationKey);
                $('#relation-detail').innerHTML = `<strong>关系研判：</strong>${relation.dataset.relationText}`;
                return;
            }
            const alertAction = event.target.closest('[data-alert-action]');
            if (alertAction) {
                handleAlertAction(alertAction.dataset.alertAction, alertAction.dataset.alertId);
                return;
            }
            const previewAlert = event.target.closest('[data-open-alert]');
            if (previewAlert) {
                const item = alerts.find((alert) => alert.id === previewAlert.dataset.openAlert);
                if (item) openAlertDetail(item);
                return;
            }
            const alertTab = event.target.closest('[data-alert-tab]');
            if (alertTab) {
                $$('[data-alert-tab]').forEach((button) => button.classList.toggle('active', button === alertTab));
                $$('.alert-tab').forEach((tab) => tab.classList.remove('active'));
                $(`#alert-tab-${alertTab.dataset.alertTab}`).classList.add('active');
                return;
            }
            const ruleDelete = event.target.closest('[data-rule-delete]');
            if (ruleDelete) {
                rules = rules.filter((rule) => rule.id !== Number(ruleDelete.dataset.ruleDelete));
                renderRules();
                showToast('规则已删除', '模拟预警规则已从列表移除。', 'success');
                return;
            }
            const historyPeriod = event.target.closest('[data-period]');
            if (historyPeriod) {
                state.historyPeriod = Number(historyPeriod.dataset.period);
                $$('#history-period button').forEach((button) => button.classList.toggle('active', button === historyPeriod));
                renderHistory();
                return;
            }
            if (!event.target.closest('.nav-dropdown')) closeDropdown();
        });

        $('#pipeline-nav').addEventListener('click', () => {
            const dropdown = $('.nav-dropdown');
            dropdown.classList.toggle('open');
            $('#pipeline-nav').setAttribute('aria-expanded', String(dropdown.classList.contains('open')));
        });
        $('#rain-play').addEventListener('click', toggleRainPlayback);
        $('#readability-toggle').addEventListener('click', toggleReadability);
        $('#simulation-toggle').addEventListener('click', toggleSimulation);
        $('#risk-weight-config-btn').addEventListener('click', openWeightConfigModal);
        $('#fullscreen-btn').addEventListener('click', async () => {
            try {
                if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
                else await document.exitFullscreen();
            } catch (error) {
                showToast('无法进入全屏', '当前浏览器未授权全屏显示。', 'warning');
            }
        });
        $('#logout-btn').addEventListener('click', () => {
            if (window.confirm('确认退出当前平台？')) {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('current_user');
                window.location.href = 'login.html';
            }
        });
        $('#factor-detail-btn').addEventListener('click', openFactorDetail);
        $('#new-rule-btn').addEventListener('click', () => {
            showPage('alerts');
            const button = $('[data-alert-tab="rules"]');
            button.click();
            setTimeout(() => $('#rule-name').focus(), 50);
        });
        ['alert-type-filter', 'alert-level-filter', 'alert-status-filter'].forEach((id) => $(`#${id}`).addEventListener('change', renderAlertTable));
        $('#alert-search').addEventListener('input', renderAlertTable);
        $('#reset-alert-filter').addEventListener('click', () => {
            $('#alert-type-filter').value = 'all'; $('#alert-level-filter').value = 'all'; $('#alert-status-filter').value = 'all'; $('#alert-search').value = '';
            renderAlertTable();
        });
        $('#rule-form').addEventListener('submit', (event) => {
            event.preventDefault();
            rules.unshift({
                id: Date.now(), name: $('#rule-name').value.trim(), type: $('#rule-type').value, level: $('#rule-level').value,
                metric: $('#rule-metric').value.trim(), threshold: $('#rule-threshold').value.trim(), condition: $('#rule-condition').value.trim(), enabled: true
            });
            event.currentTarget.reset();
            renderRules();
            showToast('规则保存成功', '新规则已加入模拟预警引擎并默认启用。', 'success');
        });
        $('#rule-list').addEventListener('change', (event) => {
            const toggle = event.target.closest('[data-rule-toggle]');
            if (!toggle) return;
            const rule = rules.find((item) => item.id === Number(toggle.dataset.ruleToggle));
            if (rule) rule.enabled = toggle.checked;
            showToast(toggle.checked ? '规则已启用' : '规则已停用', '模拟规则状态已更新。', 'info');
        });
        $('#history-region').addEventListener('change', renderHistory);
        $('#history-metric').addEventListener('change', renderHistory);
        $('#export-btn').addEventListener('click', () => showToast('演示报告已生成', '当前为前端功能演示，正式版本可在此接入PDF或Excel导出接口。', 'success'));
        $$('.modal-close').forEach((button) => button.addEventListener('click', closeModal));
        $('#detail-modal').addEventListener('click', (event) => { if (event.target === $('#detail-modal')) closeModal(); });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') { closeModal(); closeDropdown(); return; }
            if (event.key === 'Enter' || event.key === ' ') {
                const overviewDetail = document.activeElement?.closest?.('[data-overview-detail]');
                if (overviewDetail) { event.preventDefault(); openOverviewDetail(overviewDetail.dataset.overviewDetail); }
            }
        });
        window.addEventListener('resize', resizeCharts);
        window.addEventListener('hashchange', () => {
            const page = location.hash.slice(1);
            if (PAGE_TITLES[page] && page !== state.page) showPage(page);
        });
    }

    function initializeUser() {
        try {
            const user = JSON.parse(localStorage.getItem('current_user') || '{}');
            const displayName = user.nickname || user.nickName || user.realName || user.real_name || user.username || '用户';
            $('#display-user-name').textContent = displayName;
            const rawRoles = user.roleNames ?? user.roles ?? user.role ?? [];
            const roleNames = (Array.isArray(rawRoles) ? rawRoles : [rawRoles]).map((role) => {
                if (typeof role === 'string') return role;
                return role?.roleName || role?.role_name || role?.name || '';
            }).filter(Boolean);
            const isAdmin = user.isAdmin === true || user.is_admin === true || user.is_admin === 1 || roleNames.some((role) => ['administrator', 'admin', 'superadmin', '管理员', '系统管理员'].includes(String(role).trim().toLowerCase().replace(/[\s_-]/g, '')));
            state.isAdmin = isAdmin;
            const weightConfigButton = $('#risk-weight-config-btn');
            if (weightConfigButton) weightConfigButton.hidden = !isAdmin;
            const accountEntry = $('#account-entry');
            const roleLabel = $('#display-user-role');
            const avatar = $('#display-user-avatar');
            if (accountEntry) {
                accountEntry.title = isAdmin ? '进入用户与权限管理' : '进入个人中心';
                accountEntry.setAttribute('aria-label', accountEntry.title);
                // 账户页始终根据已登录用户的真实角色决定界面，不通过查询参数授予或削减权限。
                accountEntry.href = '用户管理控制台.html?v=20260813-access-fix1';
            }
            if (roleLabel) roleLabel.textContent = isAdmin ? '系统管理员' : '普通用户';
            if (avatar) {
                const avatarUrl = user.avatarUrl || user.avatar || '';
                avatar.textContent = displayName.slice(0, 1).toUpperCase();
                avatar.style.backgroundImage = avatarUrl ? `url("${String(avatarUrl).replace(/"/g, '')}")` : '';
                avatar.style.backgroundSize = avatarUrl ? 'cover' : '';
                avatar.style.backgroundPosition = avatarUrl ? 'center' : '';
                avatar.style.color = avatarUrl ? 'transparent' : '';
            }
        } catch (error) {
            $('#display-user-name').textContent = '用户';
        }
    }

    function initialize() {
        initializeUser();
        bindEvents();
        applyReadabilityMode();
        updateClock();
        setInterval(updateClock, 1000);
        $('#last-update').textContent = currentTime();
        const initialPage = PAGE_TITLES[location.hash.slice(1)] ? location.hash.slice(1) : 'overview';
        showPage(initialPage);
        loadBeijingMap();
        setInterval(() => {
            if (state.simulationPaused) return;
            $('#last-update').textContent = currentTime();
            renderActivePage();
        }, 6000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
    else initialize();
})();
