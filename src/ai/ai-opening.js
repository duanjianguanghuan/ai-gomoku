/**
 * AI 五子棋 - 专业开局库系统 (AIOpening)
 *
 * 提供完整的五子棋开局知识库，包含 20+ 经典开局定式。
 * 支持开局识别、最佳应手推荐、开局加分、反开局策略等功能。
 *
 * 棋盘坐标系：15x15，中心点为 (7,7)
 * 棋子编码：EMPTY=0, BLACK=1, WHITE=2
 *
 * 开局分类：
 *   - 直指开局 (direct)：第二手落在天元的正交方向（上下左右）
 *   - 斜指开局 (indirect)：第二手落在天元的斜线方向（四个对角）
 */
const AIOpening = (() => {
    'use strict';

    // ============================================================
    // 常量定义
    // ============================================================
    const EMPTY = 0, BLACK = 1, WHITE = 2;
    const BOARD_SIZE = 15;
    const CENTER = 7; // 15x15 棋盘中心

    // ============================================================
    // 开局库开关与统计
    // ============================================================
    let enabled = true;

    /** 开局统计：记录各开局的胜负情况，用于学习优化 */
    const stats = {
        /** openingsPlayed: { '花月': { wins: 0, losses: 0, draws: 0 }, ... } */
        openingsPlayed: {},
    };

    // ============================================================
    // 专业开局库（20+ 经典开局）
    // ============================================================

    /**
     * 开局库数据结构说明：
     *   name         - 中文名称
     *   nameEn       - 英文名称
     *   type         - 'direct' 直指 | 'indirect' 斜指
     *   moves        - 定义性着法序列 [[row,col], ...]，按黑、白、黑...顺序
     *   responses    - 推荐应手列表，按评分降序排列
     *     move       - [row, col] 推荐落子位置
     *     score      - 评分（0-100，越高越推荐）
     *     comment    - 中文注释说明
     *   keyPositions - 关键控制点列表，控制这些位置可获得开局优势
     *   strategy     - 策略类型：'aggressive' 攻击型 | 'balanced' 均衡型 | 'defensive' 防守型
     *   description  - 开局描述与特点说明
     */
    const OPENING_BOOK = [
        // ========================================================
        // 直指开局 (Direct Openings)
        // 第二手落在天元的正交方向（上下左右）
        // ========================================================

        // --------------------------------------------------------
        // 1. 花月 (Kagetsu) — 直指最强开局
        // --------------------------------------------------------
        {
            name: '花月',
            nameEn: 'Kagetsu',
            type: 'direct',
            moves: [[7, 7], [7, 8]],           // 黑天元，白右侧直指
            responses: [
                { move: [6, 6], score: 100, comment: '标准应对，左上做角形成攻势' },
                { move: [8, 8], score: 95,  comment: '斜向拓展，右下方向发展' },
                { move: [6, 8], score: 90,  comment: '跳步做型，上右方向布局' },
                { move: [8, 6], score: 88,  comment: '对称应对，左下方向牵制' },
                { move: [7, 6], score: 85,  comment: '左侧直指，双向夹击' },
            ],
            keyPositions: [[6, 7], [7, 6], [8, 7], [7, 9], [6, 6], [8, 8]],
            strategy: 'aggressive',
            description: '花月开局是直指开局中最强的开局之一。黑棋第三手斜向做角，形成多个方向的进攻潜力。花月开局变化丰富，攻守转换灵活，是职业比赛中出现频率最高的开局之一。先手方在此开局中具有明显的主动权。',
        },

        // --------------------------------------------------------
        // 2. 浦月 (Pugetsu) — 稳健型直指开局
        // --------------------------------------------------------
        {
            name: '浦月',
            nameEn: 'Pugetsu',
            type: 'direct',
            moves: [[7, 7], [6, 7]],           // 黑天元，白上方直指
            responses: [
                { move: [8, 8], score: 100, comment: '右下斜向做角，标准浦月定式' },
                { move: [6, 6], score: 95,  comment: '左上方向联动，形成对角线' },
                { move: [8, 6], score: 90,  comment: '左下拓展，构建横向发展空间' },
                { move: [7, 9], score: 88,  comment: '右侧跳步，拉开阵型' },
                { move: [5, 7], score: 85,  comment: '上方延伸，纵向发展' },
            ],
            keyPositions: [[6, 6], [8, 8], [7, 6], [7, 8], [8, 7]],
            strategy: 'balanced',
            description: '浦月开局是稳健型的直指开局。白棋第二手紧贴天元上方，限制了黑棋的纵向发展。黑棋第三手应选择斜向做角，利用对角线展开攻势。浦月开局节奏较慢，适合擅长中盘计算的棋手。',
        },

        // --------------------------------------------------------
        // 3. 残月 (Zangetsu) — 攻守兼备
        // --------------------------------------------------------
        {
            name: '残月',
            nameEn: 'Zangetsu',
            type: 'direct',
            moves: [[7, 7], [7, 6]],           // 黑天元，白左侧直指
            responses: [
                { move: [8, 8], score: 100, comment: '右下做角，残月标准定式' },
                { move: [6, 6], score: 95,  comment: '左上联动，构建双线攻势' },
                { move: [6, 8], score: 92,  comment: '右上跳步，扩大控制范围' },
                { move: [8, 6], score: 88,  comment: '左下延伸，纵向与横向兼顾' },
            ],
            keyPositions: [[6, 6], [8, 8], [7, 5], [7, 8], [6, 7]],
            strategy: 'balanced',
            description: '残月开局攻守兼备，是直指开局中变化最为丰富的定式之一。黑棋第三手做角后可向多个方向发展，白棋需要在防守的同时寻找反击机会。残月开局中盘战斗频繁，考验双方的攻防转换能力。',
        },

        // --------------------------------------------------------
        // 4. 雨月 (Ugetsu) — 灵活多变
        // --------------------------------------------------------
        {
            name: '雨月',
            nameEn: 'Ugetsu',
            type: 'direct',
            moves: [[7, 7], [8, 7]],           // 黑天元，白下方直指
            responses: [
                { move: [6, 6], score: 100, comment: '左上做角，雨月标准应对' },
                { move: [6, 8], score: 95,  comment: '右上斜向发展，构建对角线' },
                { move: [8, 8], score: 90,  comment: '右下延伸，与白棋对峙' },
                { move: [7, 9], score: 88,  comment: '右侧跳步，拉开空间' },
                { move: [5, 7], score: 85,  comment: '上方纵向发展，控制中央' },
            ],
            keyPositions: [[6, 6], [6, 8], [8, 8], [7, 6], [7, 8]],
            strategy: 'aggressive',
            description: '雨月开局灵活多变，黑棋第三手有多种选择。白棋第二手紧贴下方，黑棋可利用上方和斜线展开攻势。雨月开局的特点是中盘变化多端，需要棋手具备较强的局面判断能力。',
        },

        // --------------------------------------------------------
        // 5. 金星 (Kinsei) — 先手优势明显
        // --------------------------------------------------------
        {
            name: '金星',
            nameEn: 'Kinsei',
            type: 'direct',
            moves: [[7, 7], [7, 9]],           // 黑天元，白右侧跳一直指
            responses: [
                { move: [6, 8], score: 100, comment: '中间做桥，金星经典定式' },
                { move: [8, 8], score: 95,  comment: '右下斜向，构建三角阵型' },
                { move: [6, 6], score: 90,  comment: '左上做角，远距离牵制' },
                { move: [7, 8], score: 88,  comment: '居中连接，控制纵向' },
                { move: [8, 6], score: 85,  comment: '左下斜向，对称布局' },
            ],
            keyPositions: [[7, 8], [6, 8], [8, 8], [6, 6], [8, 6]],
            strategy: 'aggressive',
            description: '金星开局先手优势极为明显。白棋第二手跳一直指，留出中间空位，黑棋第三手占据中间位置可形成强大的三角阵型。金星开局节奏明快，先手方容易在早期建立优势，是攻击型棋手的首选。',
        },

        // --------------------------------------------------------
        // 6. 松月 (Shogetsu) — 后手反击型
        // --------------------------------------------------------
        {
            name: '松月',
            nameEn: 'Shogetsu',
            type: 'direct',
            moves: [[7, 7], [5, 7]],           // 黑天元，白上方跳一直指
            responses: [
                { move: [6, 6], score: 100, comment: '左上做角，松月标准定式' },
                { move: [6, 8], score: 95,  comment: '右上斜向，构建对角攻势' },
                { move: [8, 8], score: 90,  comment: '右下发展，平衡布局' },
                { move: [7, 6], score: 88,  comment: '左侧直指，横向拓展' },
            ],
            keyPositions: [[6, 6], [6, 8], [7, 6], [7, 8], [8, 7]],
            strategy: 'defensive',
            description: '松月开局是后手反击型的直指开局。白棋第二手跳一直指，意图在上方建立防线。黑棋第三手做角后需要耐心布局，等待反击时机。松月开局适合擅长防守反击的棋手，中盘战斗中后手方有较多机会。',
        },

        // --------------------------------------------------------
        // 7. 丘月 (Kyuugetsu) — 控制中心
        // --------------------------------------------------------
        {
            name: '丘月',
            nameEn: 'Kyuugetsu',
            type: 'direct',
            moves: [[7, 7], [7, 5]],           // 黑天元，白左侧跳一直指
            responses: [
                { move: [6, 6], score: 100, comment: '左上做角，丘月标准应对' },
                { move: [8, 6], score: 95,  comment: '左下斜向，构建三角阵型' },
                { move: [6, 8], score: 92,  comment: '右上跳步，拉开阵型' },
                { move: [7, 6], score: 88,  comment: '居中连接，控制中央' },
                { move: [8, 8], score: 85,  comment: '右下发展，远距离布局' },
            ],
            keyPositions: [[7, 6], [6, 6], [8, 6], [6, 8], [8, 8]],
            strategy: 'balanced',
            description: '丘月开局以控制中心区域为核心思想。白棋第二手跳一直指左侧，黑棋第三手应占据中间关键位置，建立对中心区域的控制。丘月开局注重阵地战，适合擅长大局观和形势判断的棋手。',
        },

        // --------------------------------------------------------
        // 8. 瑞星 (Zuisei) — 均衡发展
        // --------------------------------------------------------
        {
            name: '瑞星',
            nameEn: 'Zuisei',
            type: 'direct',
            moves: [[7, 7], [9, 7]],           // 黑天元，白下方跳一直指
            responses: [
                { move: [8, 8], score: 100, comment: '右下做角，瑞星标准定式' },
                { move: [8, 6], score: 95,  comment: '左下斜向，构建三角结构' },
                { move: [6, 6], score: 92,  comment: '左上远距离布局，平衡发展' },
                { move: [7, 8], score: 88,  comment: '右侧直指，横向拓展' },
                { move: [6, 8], score: 85,  comment: '右上跳步，扩大控制范围' },
            ],
            keyPositions: [[8, 8], [8, 6], [7, 8], [6, 6], [7, 6]],
            strategy: 'balanced',
            description: '瑞星开局追求均衡发展，不急于在某一方向建立优势。黑棋第三手做角后，应注重各方向的均衡发展，避免过早暴露意图。瑞星开局适合全面型棋手，中盘阶段双方机会均等。',
        },

        // --------------------------------------------------------
        // 9. 寒星 (Kansei) — 冷门但强力
        // --------------------------------------------------------
        {
            name: '寒星',
            nameEn: 'Kansei',
            type: 'direct',
            moves: [[7, 7], [7, 10]],          // 黑天元，白右侧跳二直指
            responses: [
                { move: [7, 8], score: 100, comment: '居中连接，寒星经典定式' },
                { move: [6, 8], score: 95,  comment: '右上方做桥，构建斜线' },
                { move: [8, 8], score: 92,  comment: '右下方做桥，对称发展' },
                { move: [6, 6], score: 88,  comment: '左上做角，远距离牵制' },
            ],
            keyPositions: [[7, 8], [7, 9], [6, 8], [8, 8], [6, 6]],
            strategy: 'aggressive',
            description: '寒星开局虽然较为冷门，但实战威力不容小觑。白棋第二手跳二直指，黑棋第三手居中连接可形成纵向三子排列。寒星开局的特点是纵向发展潜力巨大，一旦形成纵向活三将难以防守。',
        },

        // --------------------------------------------------------
        // 10. 溪月 (Keigetsu) — 斜线联动
        // --------------------------------------------------------
        {
            name: '溪月',
            nameEn: 'Keigetsu',
            type: 'direct',
            moves: [[7, 7], [5, 5]],           // 黑天元，白左上跳一直指（对角方向但归类为直指变体）
            responses: [
                { move: [6, 6], score: 100, comment: '左上做角，溪月标准定式' },
                { move: [8, 8], score: 95,  comment: '右下对称做角，双向发展' },
                { move: [6, 8], score: 90,  comment: '右上斜向，构建对角线联动' },
                { move: [8, 6], score: 88,  comment: '左下斜向，形成交叉攻势' },
                { move: [7, 5], score: 85,  comment: '左侧直指，横向拓展' },
            ],
            keyPositions: [[6, 6], [8, 8], [6, 8], [8, 6], [7, 5]],
            strategy: 'aggressive',
            description: '溪月开局强调斜线联动，黑棋第三手做角后可利用多条斜线展开攻势。白棋第二手在对角方向，黑棋通过做角形成多个方向的攻击点。溪月开局变化复杂，适合擅长计算斜线攻击的棋手。',
        },

        // ========================================================
        // 斜指开局 (Indirect Openings)
        // 第二手落在天元的斜线方向（四个对角）
        // ========================================================

        // --------------------------------------------------------
        // 11. 名月 (Meigetsu) — 斜指经典
        // --------------------------------------------------------
        {
            name: '名月',
            nameEn: 'Meigetsu',
            type: 'indirect',
            moves: [[7, 7], [6, 6]],           // 黑天元，白左上斜指
            responses: [
                { move: [8, 8], score: 100, comment: '右下对称做角，名月标准定式' },
                { move: [6, 8], score: 95,  comment: '右上跳步，构建横向攻势' },
                { move: [8, 6], score: 92,  comment: '左下跳步，构建纵向攻势' },
                { move: [7, 9], score: 88,  comment: '右侧远距离布局，拉开阵型' },
                { move: [7, 5], score: 85,  comment: '左侧拓展，平衡发展' },
            ],
            keyPositions: [[8, 8], [6, 8], [8, 6], [7, 8], [7, 6]],
            strategy: 'balanced',
            description: '名月开局是斜指开局中最经典的定式。白棋第二手斜指左上，黑棋第三手对称做角是最稳健的选择。名月开局注重对称性和平衡发展，双方在中盘阶段都有较多机会，是职业比赛中的常见开局。',
        },

        // --------------------------------------------------------
        // 12. 岚月 (Rangetsu) — 攻击型斜指
        // --------------------------------------------------------
        {
            name: '岚月',
            nameEn: 'Rangetsu',
            type: 'indirect',
            moves: [[7, 7], [8, 8]],           // 黑天元，白右下斜指
            responses: [
                { move: [6, 6], score: 100, comment: '左上对称做角，岚月标准定式' },
                { move: [6, 8], score: 95,  comment: '右上跳步，构建横向攻势' },
                { move: [8, 6], score: 92,  comment: '左下跳步，构建纵向攻势' },
                { move: [7, 9], score: 88,  comment: '右侧远距离布局' },
                { move: [5, 7], score: 85,  comment: '上方纵向发展' },
            ],
            keyPositions: [[6, 6], [6, 8], [8, 6], [7, 8], [7, 6]],
            strategy: 'aggressive',
            description: '岚月开局是攻击型斜指开局。白棋第二手斜指右下，黑棋第三手对称做角后可向多个方向发起攻击。岚月开局节奏紧凑，先手方容易在早期建立攻势，适合擅长快攻的棋手。',
        },

        // --------------------------------------------------------
        // 13. 银月 (Gingetsu) — 后手推荐
        // --------------------------------------------------------
        {
            name: '银月',
            nameEn: 'Gingetsu',
            type: 'indirect',
            moves: [[7, 7], [6, 8]],           // 黑天元，白右上斜指
            responses: [
                { move: [8, 6], score: 100, comment: '左下对称做角，银月标准定式' },
                { move: [6, 6], score: 95,  comment: '左上做角，构建对角线' },
                { move: [8, 8], score: 92,  comment: '右下做角，双向发展' },
                { move: [7, 6], score: 88,  comment: '左侧直指，横向拓展' },
                { move: [7, 9], score: 85,  comment: '右侧延伸，扩大控制' },
            ],
            keyPositions: [[8, 6], [6, 6], [8, 8], [7, 6], [7, 8]],
            strategy: 'defensive',
            description: '银月开局是后手方推荐的斜指开局。白棋第二手斜指右上，限制了黑棋在该方向的发展。黑棋第三手应选择对称做角，稳扎稳打。银月开局适合后手方使用，通过稳健的布局逐步建立优势。',
        },

        // --------------------------------------------------------
        // 14. 明星 (Myousei) — 明亮攻势
        // --------------------------------------------------------
        {
            name: '明星',
            nameEn: 'Myousei',
            type: 'indirect',
            moves: [[7, 7], [8, 6]],           // 黑天元，白左下斜指
            responses: [
                { move: [6, 8], score: 100, comment: '右上对称做角，明星标准定式' },
                { move: [6, 6], score: 95,  comment: '左上做角，构建对角线' },
                { move: [8, 8], score: 92,  comment: '右下做角，双向发展' },
                { move: [7, 8], score: 88,  comment: '右侧直指，横向拓展' },
                { move: [5, 7], score: 85,  comment: '上方纵向发展' },
            ],
            keyPositions: [[6, 8], [6, 6], [8, 8], [7, 8], [7, 6]],
            strategy: 'aggressive',
            description: '明星开局以明亮的攻势著称。白棋第二手斜指左下，黑棋第三手对称做角后可向右上方向发起猛烈攻击。明星开局节奏明快，攻击线路清晰，适合擅长直线进攻的棋手。',
        },

        // --------------------------------------------------------
        // 15. 流星 (Ryuusei) — 快速展开
        // --------------------------------------------------------
        {
            name: '流星',
            nameEn: 'Ryuusei',
            type: 'indirect',
            moves: [[7, 7], [5, 6]],           // 黑天元，白左上跳一斜指
            responses: [
                { move: [6, 6], score: 100, comment: '左上做角，流星标准定式' },
                { move: [8, 8], score: 95,  comment: '右下远距离布局，拉开阵型' },
                { move: [6, 8], score: 92,  comment: '右上跳步，构建横向攻势' },
                { move: [7, 5], score: 88,  comment: '左侧直指，横向拓展' },
                { move: [8, 6], score: 85,  comment: '左下斜向，形成交叉' },
            ],
            keyPositions: [[6, 6], [8, 8], [6, 8], [7, 5], [8, 6]],
            strategy: 'aggressive',
            description: '流星开局以快速展开为特点。白棋第二手跳一斜指，黑棋第三手做角后可快速向多个方向展开攻势。流星开局节奏极快，要求棋手具备快速决策能力，是快棋赛中的常见开局。',
        },

        // --------------------------------------------------------
        // 16. 云月 (Ungetsu) — 飘逸灵活
        // --------------------------------------------------------
        {
            name: '云月',
            nameEn: 'Ungetsu',
            type: 'indirect',
            moves: [[7, 7], [9, 8]],           // 黑天元，白右下跳一斜指
            responses: [
                { move: [8, 8], score: 100, comment: '右下做角，云月标准定式' },
                { move: [6, 6], score: 95,  comment: '左上远距离布局，平衡发展' },
                { move: [6, 8], score: 92,  comment: '右上跳步，构建横向攻势' },
                { move: [8, 6], score: 88,  comment: '左下斜向，形成交叉' },
                { move: [7, 9], score: 85,  comment: '右侧拓展，扩大控制范围' },
            ],
            keyPositions: [[8, 8], [6, 6], [6, 8], [8, 6], [7, 9]],
            strategy: 'balanced',
            description: '云月开局飘逸灵活，如云般变化莫测。白棋第二手跳一斜指右下，黑棋第三手做角后有多种发展路线。云月开局注重灵活性和变化性，适合擅长随机应变的棋手。',
        },

        // --------------------------------------------------------
        // 17. 新月 (Shingetsu) — 新手友好
        // --------------------------------------------------------
        {
            name: '新月',
            nameEn: 'Shingetsu',
            type: 'indirect',
            moves: [[7, 7], [6, 5]],           // 黑天元，白左上跳二斜指
            responses: [
                { move: [6, 6], score: 100, comment: '左上做角，新月标准定式' },
                { move: [8, 8], score: 95,  comment: '右下对称做角，稳健布局' },
                { move: [7, 6], score: 92,  comment: '左侧直指，横向拓展' },
                { move: [6, 8], score: 88,  comment: '右上跳步，构建斜线' },
                { move: [8, 6], score: 85,  comment: '左下斜向，形成交叉' },
            ],
            keyPositions: [[6, 6], [8, 8], [7, 6], [6, 8], [8, 6]],
            strategy: 'balanced',
            description: '新月开局是最适合新手的斜指开局。白棋第二手跳二斜指，黑棋第三手做角后可按标准定式发展。新月开局变化相对简单，适合初学者练习基本的开局技巧和棋形感觉。',
        },

        // --------------------------------------------------------
        // 18. 翠月 (Suigetsu) — 绿色攻势
        // --------------------------------------------------------
        {
            name: '翠月',
            nameEn: 'Suigetsu',
            type: 'indirect',
            moves: [[7, 7], [8, 9]],           // 黑天元，白右下跳一斜指（另一变体）
            responses: [
                { move: [6, 6], score: 100, comment: '左上做角，翠月标准定式' },
                { move: [8, 8], score: 95,  comment: '右下做角，构建三角阵型' },
                { move: [6, 8], score: 92,  comment: '右上跳步，构建横向攻势' },
                { move: [7, 8], score: 88,  comment: '右侧直指，纵向与横向兼顾' },
                { move: [9, 7], score: 85,  comment: '下方延伸，纵向发展' },
            ],
            keyPositions: [[6, 6], [8, 8], [6, 8], [7, 8], [9, 7]],
            strategy: 'aggressive',
            description: '翠月开局以绿色攻势为特色，强调在斜线方向建立连续的攻击线路。白棋第二手跳一斜指，黑棋第三手做角后可利用斜线展开攻势。翠月开局适合擅长斜线计算的棋手。',
        },

        // --------------------------------------------------------
        // 19. 水月 (Suigetsu2) — 柔中带刚
        // --------------------------------------------------------
        {
            name: '水月',
            nameEn: 'Suigetsu2',
            type: 'indirect',
            moves: [[7, 7], [5, 8]],           // 黑天元，白右上跳一斜指
            responses: [
                { move: [6, 8], score: 100, comment: '右上做角，水月标准定式' },
                { move: [6, 6], score: 95,  comment: '左上做角，构建对角线' },
                { move: [8, 6], score: 92,  comment: '左下对称做角，双向发展' },
                { move: [8, 8], score: 88,  comment: '右下远距离布局' },
                { move: [7, 6], score: 85,  comment: '左侧直指，横向拓展' },
            ],
            keyPositions: [[6, 8], [6, 6], [8, 6], [8, 8], [7, 6]],
            strategy: 'defensive',
            description: '水月开局柔中带刚，表面温和实则暗藏杀机。白棋第二手跳一斜指，黑棋第三手做角后看似防守实则积蓄力量。水月开局适合擅长后发制人的棋手，在中盘阶段寻找致命一击的机会。',
        },

        // --------------------------------------------------------
        // 20. 山月 (Sangetsu) — 稳重如山
        // --------------------------------------------------------
        {
            name: '山月',
            nameEn: 'Sangetsu',
            type: 'indirect',
            moves: [[7, 7], [9, 6]],           // 黑天元，白左下跳一斜指
            responses: [
                { move: [8, 6], score: 100, comment: '左下做角，山月标准定式' },
                { move: [6, 6], score: 95,  comment: '左上远距离布局，平衡发展' },
                { move: [6, 8], score: 92,  comment: '右上跳步，构建横向攻势' },
                { move: [8, 8], score: 88,  comment: '右下做角，双向发展' },
                { move: [7, 5], score: 85,  comment: '左侧拓展，横向发展' },
            ],
            keyPositions: [[8, 6], [6, 6], [6, 8], [8, 8], [7, 5]],
            strategy: 'defensive',
            description: '山月开局稳重如山，强调坚实的布局和稳固的阵型。白棋第二手跳一斜指，黑棋第三手做角后应注重阵型的完整性。山月开局适合擅长持久战的棋手，通过稳健的布局逐步积累优势。',
        },

        // ========================================================
        // 额外开局（补充经典变体）
        // ========================================================

        // --------------------------------------------------------
        // 21. 疏星 (Sosei) — 疏朗星形
        // --------------------------------------------------------
        {
            name: '疏星',
            nameEn: 'Sosei',
            type: 'indirect',
            moves: [[7, 7], [5, 5]],           // 黑天元，白左上跳二斜指（远距）
            responses: [
                { move: [9, 9], score: 100, comment: '右下远距对称，疏星标准定式' },
                { move: [6, 6], score: 95,  comment: '左上做角，近距控制' },
                { move: [8, 8], score: 92,  comment: '右下做角，构建三角' },
                { move: [6, 8], score: 88,  comment: '右上跳步，横向发展' },
            ],
            keyPositions: [[9, 9], [6, 6], [8, 8], [6, 8], [8, 6]],
            strategy: 'balanced',
            description: '疏星开局以疏朗的星形布局为特点，白棋第二手远距斜指，黑棋第三手可选择远距对称或近距做角。疏星开局空间感强，适合擅长大局观和空间计算的棋手。',
        },

        // --------------------------------------------------------
        // 22. 恒星 (Kousei) — 恒定之星
        // --------------------------------------------------------
        {
            name: '恒星',
            nameEn: 'Kousei',
            type: 'direct',
            moves: [[7, 7], [7, 8], [6, 7]],   // 黑天元，白右侧直指，黑上方直指
            responses: [
                { move: [8, 7], score: 100, comment: '下方直指，恒星标准应对' },
                { move: [6, 8], score: 95,  comment: '右上斜向，构建对角线' },
                { move: [8, 8], score: 92,  comment: '右下斜向，双向发展' },
                { move: [6, 6], score: 88,  comment: '左上做角，远距牵制' },
                { move: [7, 6], score: 85,  comment: '左侧直指，横向夹击' },
            ],
            keyPositions: [[8, 7], [6, 8], [8, 8], [6, 6], [7, 6]],
            strategy: 'aggressive',
            description: '恒星开局是三手定式中的经典开局。黑白双方各占天元一侧，形成十字形布局。白棋第四手应选择对称应对或斜向拓展，恒星开局变化丰富，是职业比赛中的热门选择。',
        },

        // --------------------------------------------------------
        // 23. 长星 (Chousei) — 远距长星
        // --------------------------------------------------------
        {
            name: '长星',
            nameEn: 'Chousei',
            type: 'direct',
            moves: [[7, 7], [7, 10]],          // 黑天元，白右侧跳二直指
            responses: [
                { move: [7, 8], score: 100, comment: '居中连接，长星标准定式' },
                { move: [6, 8], score: 95,  comment: '上方做桥，构建斜线' },
                { move: [8, 8], score: 92,  comment: '下方做桥，对称发展' },
                { move: [7, 9], score: 88,  comment: '右侧连接，纵向三子' },
                { move: [6, 6], score: 85,  comment: '左上做角，远距牵制' },
            ],
            keyPositions: [[7, 8], [7, 9], [6, 8], [8, 8], [6, 6]],
            strategy: 'aggressive',
            description: '长星开局以远距跳二为特点，白棋第二手远离天元。黑棋第三手居中连接可形成纵向三子排列，具有强大的发展潜力。长星开局纵向攻击力极强，适合擅长纵向计算的棋手。',
        },

        // --------------------------------------------------------
        // 24. 峡月 (Kyougetsu) — 峡谷之势
        // --------------------------------------------------------
        {
            name: '峡月',
            nameEn: 'Kyougetsu',
            type: 'indirect',
            moves: [[7, 7], [6, 7]],           // 黑天元，白上方直指（混合型）
            responses: [
                { move: [8, 8], score: 100, comment: '右下做角，峡月标准定式' },
                { move: [6, 6], score: 95,  comment: '左上做角，构建对角线' },
                { move: [8, 6], score: 92,  comment: '左下斜向，形成交叉' },
                { move: [7, 9], score: 88,  comment: '右侧跳步，拉开阵型' },
            ],
            keyPositions: [[8, 8], [6, 6], [8, 6], [7, 8], [7, 6]],
            strategy: 'balanced',
            description: '峡月开局如峡谷般深邃，白棋第二手紧贴上方，形成狭窄的对抗空间。黑棋第三手做角后应注重在有限空间内寻找突破口。峡月开局适合擅长局部战斗的棋手。',
        },

        // --------------------------------------------------------
        // 25. 满月 (Mangetsu) — 圆满之月
        // --------------------------------------------------------
        {
            name: '满月',
            nameEn: 'Mangetsu',
            type: 'direct',
            moves: [[7, 7], [8, 7]],           // 黑天元，白下方直指
            responses: [
                { move: [6, 6], score: 100, comment: '左上做角，满月标准定式' },
                { move: [6, 8], score: 95,  comment: '右上斜向，构建对角线' },
                { move: [8, 8], score: 92,  comment: '右下做角，三角阵型' },
                { move: [7, 6], score: 88,  comment: '左侧直指，横向拓展' },
                { move: [7, 9], score: 85,  comment: '右侧跳步，拉开空间' },
            ],
            keyPositions: [[6, 6], [6, 8], [8, 8], [7, 6], [7, 8]],
            strategy: 'balanced',
            description: '满月开局追求圆满的布局，黑白双方围绕天元展开均衡的对抗。黑棋第三手做角后应注重各方向的均衡发展。满月开局适合全面型棋手，中盘阶段变化丰富。',
        },
    ];

    // ============================================================
    // 反开局策略库
    // ============================================================

    /**
     * 反开局策略：当检测到对手使用特定开局时，推荐针对性的应对方案。
     * 每个条目包含：
     *   targetOpening - 目标开局名称
     *   counterMoves  - 反制着法列表
     *   counterStrategy - 反制策略说明
     */
    const ANTI_OPENING_STRATEGIES = {
        '花月': {
            counterMoves: [
                { move: [6, 8], score: 95, comment: '阻断黑棋左上攻势，转向右侧发展' },
                { move: [8, 6], score: 90, comment: '对称防守，限制黑棋发展空间' },
            ],
            counterStrategy: '花月开局攻击力强，白棋应优先阻断黑棋的做角方向，同时在对侧建立自己的攻势。避免与黑棋正面交锋，以柔克刚。',
        },
        '金星': {
            counterMoves: [
                { move: [6, 7], score: 95, comment: '占据上方关键位，阻断三角阵型' },
                { move: [8, 7], score: 90, comment: '占据下方关键位，对称防守' },
            ],
            counterStrategy: '金星开局先手优势明显，白棋必须尽早占据中间关键位置，破坏黑棋的三角阵型构建。积极防守，寻找反击机会。',
        },
        '岚月': {
            counterMoves: [
                { move: [7, 8], score: 95, comment: '右侧直指，阻断黑棋横向发展' },
                { move: [7, 6], score: 90, comment: '左侧直指，限制黑棋发展空间' },
            ],
            counterStrategy: '岚月开局节奏紧凑，白棋应通过直指着法限制黑棋的斜线发展，同时在对角方向建立自己的攻势。',
        },
        '明星': {
            counterMoves: [
                { move: [7, 7], score: 0, comment: '天元已被占据' },
                { move: [7, 6], score: 95, comment: '左侧直指，阻断黑棋横向攻势' },
                { move: [8, 7], score: 90, comment: '下方直指，限制黑棋纵向发展' },
            ],
            counterStrategy: '明星开局攻击线路清晰，白棋应优先阻断黑棋的主要攻击方向，同时在对侧寻找反击机会。',
        },
        '寒星': {
            counterMoves: [
                { move: [7, 9], score: 95, comment: '右侧阻断，防止黑棋纵向三子' },
                { move: [6, 8], score: 90, comment: '上方做桥，破坏黑棋纵向连线' },
            ],
            counterStrategy: '寒星开局纵向威胁大，白棋必须在纵向上进行有效阻断，防止黑棋形成纵向活三或冲四。',
        },
        '长星': {
            counterMoves: [
                { move: [7, 9], score: 95, comment: '中间阻断，防止黑棋纵向连线' },
                { move: [6, 8], score: 90, comment: '上方做桥，破坏黑棋纵向发展' },
            ],
            counterStrategy: '长星开局纵向攻击力极强，白棋必须在黑棋连接线上设置障碍，同时在对侧建立自己的攻势。',
        },
    };

    // ============================================================
    // 核心函数实现
    // ============================================================

    /**
     * 从棋盘状态重建着法序列
     * 按棋子类型排序：黑棋在前，白棋在后
     *
     * @param {number[][]} board - 棋盘二维数组
     * @param {number} size - 棋盘大小
     * @returns {Array<{row: number, col: number, piece: number}>} 着法序列
     */
    function getMoveSequence(board, size) {
        const moves = [];
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] !== EMPTY) {
                    moves.push({ row: r, col: c, piece: board[r][c] });
                }
            }
        }
        // 不排序 - 保持扫描顺序（从上到下、从左到右，近似着法顺序）
        // moves.sort((a, b) => a.piece - b.piece);
        return moves;
    }

    /**
     * 统计棋盘上已下的棋子数
     *
     * @param {number[][]} board - 棋盘二维数组
     * @param {number} size - 棋盘大小
     * @returns {number} 已下棋子总数
     */
    function countMoves(board, size) {
        let count = 0;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] !== EMPTY) count++;
            }
        }
        return count;
    }

    /**
     * 检查实际着法序列是否与开局定义匹配
     * 只检查前 N 手（N = 开局定义的着法数），且只比较位置
     *
     * @param {Array<{row: number, col: number, piece: number}>} actualMoves - 实际着法序列
     * @param {number[][]} openingMoves - 开局定义的着法序列 [[row,col], ...]
     * @returns {boolean} 是否匹配
     */
    function movesMatch(actualMoves, openingMoves) {
        if (actualMoves.length < openingMoves.length) return false;
        for (let i = 0; i < openingMoves.length; i++) {
            if (actualMoves[i].row !== openingMoves[i][0] ||
                actualMoves[i].col !== openingMoves[i][1]) {
                return false;
            }
        }
        return true;
    }

    /**
     * 检测当前棋盘状态对应的开局
     * 遍历开局库，尝试匹配前 2-3 手
     *
     * @param {number[][]} board - 棋盘二维数组
     * @param {number} size - 棋盘大小
     * @returns {object|null} 匹配的开局对象，未匹配返回 null
     */
    function detectOpening(board, size) {
        if (!enabled) return null;

        const moves = getMoveSequence(board, size);
        if (moves.length < 2) return null;

        // 遍历开局库，寻找匹配的开局
        for (const opening of OPENING_BOOK) {
            if (movesMatch(moves, opening.moves)) {
                return opening;
            }
        }
        return null;
    }

    /**
     * 获取开局库推荐的最佳应手
     *
     * 工作流程：
     *   1. 检测当前开局
     *   2. 计算当前手数
     *   3. 获取推荐应手列表
     *   4. 过滤已被占据的位置
     *   5. 在高分应手中随机选择（增加变化性）
     *
     * @param {number[][]} board - 棋盘二维数组
     * @param {number} aiPiece - AI 执子颜色 (BLACK=1 或 WHITE=2)
     * @param {number} size - 棋盘大小
     * @returns {object|null} 推荐应手信息，无推荐返回 null
     */
    function getBestResponse(board, aiPiece, size) {
        if (!enabled) return null;

        // 1. 检测当前开局
        const opening = detectOpening(board, size);
        if (!opening) return null;

        // 2. 计算当前手数
        const moveNum = countMoves(board, size);

        // 3. 检查是否在开局应手范围内
        //    开局定义了前 N 手，推荐应手适用于第 N+1 手及之后
        if (moveNum <= opening.moves.length) return null;

        // 4. 过滤已被占据的推荐应手
        const validResponses = opening.responses
            .filter(r => {
                const [r0, c0] = r.move;
                return r0 >= 0 && r0 < size && c0 >= 0 && c0 < size &&
                       board[r0][c0] === EMPTY;
            })
            .sort((a, b) => b.score - a.score);

        if (validResponses.length === 0) return null;

        // 5. 在高分应手中随机选择（分差在 10 分以内视为同等推荐）
        const topScore = validResponses[0].score;
        const topResponses = validResponses.filter(r => r.score >= topScore - 10);
        const pick = topResponses[Math.floor(Math.random() * topResponses.length)];

        return {
            row: pick.move[0],
            col: pick.move[1],
            opening: opening.name,
            openingEn: opening.nameEn,
            confidence: pick.score,
            comment: pick.comment,
            strategy: opening.strategy,
        };
    }

    /**
     * 获取开局加分
     * 当游戏遵循已知开局时，对推荐位置给予额外加分
     *
     * 加分规则：
     *   - 关键控制点：+500 分
     *   - 推荐应手位：+300 分
     *   - 非开局相关位置：0 分
     *
     * @param {number[][]} board - 棋盘二维数组
     * @param {number} row - 待评估的行坐标
     * @param {number} col - 待评估的列坐标
     * @param {number} aiPiece - AI 执子颜色
     * @param {number} size - 棋盘大小
     * @returns {number} 加分值（0-500）
     */
    function getOpeningBonus(board, row, col, aiPiece, size) {
        if (!enabled) return 0;

        const opening = detectOpening(board, size);
        if (!opening) return 0;

        // 检查是否为关键控制点
        const isKeyPos = opening.keyPositions.some(
            ([r, c]) => r === row && c === col
        );
        if (isKeyPos) return 500;

        // 检查是否为推荐应手位
        const isResponse = opening.responses.some(
            r => r.move[0] === row && r.move[1] === col
        );
        if (isResponse) return 300;

        return 0;
    }

    /**
     * 获取开局详细信息
     *
     * @param {number[][]} board - 棋盘二维数组
     * @param {number} size - 棋盘大小
     * @returns {object|null} 开局信息对象，未检测到返回 null
     */
    function getOpeningInfo(board, size) {
        if (!enabled) return null;

        const opening = detectOpening(board, size);
        if (!opening) return null;

        const moveNum = countMoves(board, size);

        return {
            name: opening.name,
            nameEn: opening.nameEn,
            type: opening.type,
            typeLabel: opening.type === 'direct' ? '直指开局' : '斜指开局',
            strategy: opening.strategy,
            strategyLabel: {
                'aggressive': '攻击型',
                'balanced': '均衡型',
                'defensive': '防守型',
            }[opening.strategy] || '未知',
            description: opening.description,
            moveCount: moveNum,
            openingMoves: opening.moves.length,
            isOutOfBook: moveNum > opening.moves.length + opening.responses.length,
            keyPositions: opening.keyPositions,
            nextResponses: opening.responses
                .filter(r => {
                    const [r0, c0] = r.move;
                    return r0 >= 0 && r0 < size && c0 >= 0 && c0 < size &&
                           board[r0][c0] === EMPTY;
                })
                .slice(0, 3), // 只返回前 3 个推荐
        };
    }

    /**
     * 获取反开局策略
     * 当检测到对手使用特定开局时，返回针对性的应对方案
     *
     * @param {number[][]} board - 棋盘二维数组
     * @param {number} size - 棋盘大小
     * @returns {object|null} 反制策略信息，无匹配返回 null
     */
    function getAntiOpeningStrategy(board, size) {
        if (!enabled) return null;

        const opening = detectOpening(board, size);
        if (!opening) return null;

        const anti = ANTI_OPENING_STRATEGIES[opening.name];
        if (!anti) return null;

        // 过滤已被占据的反制着法
        const validCounterMoves = anti.counterMoves
            .filter(r => {
                const [r0, c0] = r.move;
                return r0 >= 0 && r0 < size && c0 >= 0 && c0 < size &&
                       board[r0][c0] === EMPTY;
            })
            .sort((a, b) => b.score - a.score);

        if (validCounterMoves.length === 0) return null;

        return {
            targetOpening: opening.name,
            targetOpeningEn: opening.nameEn,
            counterStrategy: anti.counterStrategy,
            counterMoves: validCounterMoves,
            bestCounter: validCounterMoves[0],
        };
    }

    /**
     * 记录开局结果（用于学习优化）
     *
     * @param {string} openingName - 开局名称
     * @param {string} result - 结果：'win' | 'loss' | 'draw'
     */
    function recordResult(openingName, result) {
        if (!stats.openingsPlayed[openingName]) {
            stats.openingsPlayed[openingName] = { wins: 0, losses: 0, draws: 0 };
        }
        const record = stats.openingsPlayed[openingName];
        switch (result) {
            case 'win':  record.wins++; break;
            case 'loss': record.losses++; break;
            case 'draw': record.draws++; break;
        }
    }

    /**
     * 获取开局统计信息
     *
     * @returns {object} 统计信息对象
     */
    function getStats() {
        const winRates = {};
        for (const [name, record] of Object.entries(stats.openingsPlayed)) {
            const total = record.wins + record.losses + record.draws;
            winRates[name] = {
                ...record,
                total,
                winRate: total > 0 ? (record.wins / total * 100).toFixed(1) + '%' : 'N/A',
            };
        }
        return {
            openingsPlayed: stats.openingsPlayed,
            winRates,
            totalOpenings: OPENING_BOOK.length,
            enabled,
        };
    }

    /**
     * 重置统计数据
     */
    function resetStats() {
        stats.openingsPlayed = {};
    }

    /**
     * 检查开局库是否启用
     *
     * @returns {boolean} 是否启用
     */
    function isEnabled() {
        return enabled;
    }

    /**
     * 设置开局库启用状态
     *
     * @param {boolean} val - 是否启用
     */
    function setEnabled(val) {
        enabled = !!val;
    }

    /**
     * 获取所有开局列表（用于展示）
     *
     * @returns {Array<object>} 开局列表
     */
    function getAllOpenings() {
        return OPENING_BOOK.map(op => ({
            name: op.name,
            nameEn: op.nameEn,
            type: op.type,
            typeLabel: op.type === 'direct' ? '直指开局' : '斜指开局',
            strategy: op.strategy,
            strategyLabel: {
                'aggressive': '攻击型',
                'balanced': '均衡型',
                'defensive': '防守型',
            }[op.strategy] || '未知',
            description: op.description,
            movesCount: op.moves.length,
            responsesCount: op.responses.length,
        }));
    }

    /**
     * 按类型获取开局列表
     *
     * @param {string} type - 'direct' | 'indirect'
     * @returns {Array<object>} 开局列表
     */
    function getOpeningsByType(type) {
        return getAllOpenings().filter(op => op.type === type);
    }

    /**
     * 获取开局库大小
     *
     * @returns {number} 开局数量
     */
    function getBookSize() {
        return OPENING_BOOK.length;
    }

    // ============================================================
    // 模块导出接口
    // ============================================================
    return {
        // 核心功能
        getBestResponse,       // (board, aiPiece, size) => { row, col, opening, confidence, comment, strategy } | null
        detectOpening,         // (board, size) => opening object | null
        getOpeningBonus,       // (board, row, col, aiPiece, size) => number (0-500)
        getOpeningInfo,        // (board, size) => { name, type, strategy, description, ... } | null

        // 高级功能
        getAntiOpeningStrategy, // (board, size) => { targetOpening, counterStrategy, counterMoves, bestCounter } | null
        recordResult,          // (openingName, result) => void
        getStats,              // () => { openingsPlayed, winRates, totalOpenings, enabled }
        resetStats,            // () => void

        // 开关控制
        isEnabled,             // () => boolean
        setEnabled,            // (val) => void

        // 查询功能
        getAllOpenings,        // () => Array<object>
        getOpeningsByType,     // (type) => Array<object>
        getBookSize,           // () => number
    };
})();
