# Better Combat 动作适配

工程师酒狐模型适配 YSM 2.6.5／Better Combat 2.4.0（Minecraft 1.21.1 NeoForge）。最低需要 YSM 2.6.3 的 `ysm-builtin` 回退状态。

- 主手剑的 `one_handed_slash_horizontal_right`／`left` 复用原作者左右挥砍姿态；`one_handed_stab` 使用 idle 起手、微转抬剑、落剑瞄准、回转前送、分层收势并回到 idle。保留已验收编号1/2/3、视觉时钟、关键帧和单击／连击体验。
- 主手普通斧的两个同名横砍使用视觉双手动作：首次右手带斧、左手迎柄，双手挥砍并保持末姿；连击持续握柄，单击收势先松左手再让双臂归位。动作4/5用于钻石／下界合金斧的 `Rightfutou`，6/7用于普通游戏物品路径。模型不计数、不自行交替或补第三刀，也不修改武器属性、攻击范围或副手机制。
- 所有名称只接受精确的裸值或一对双引号包裹值。未安装 Better Combat、只持物无攻击、镐、未知动作、斧突刺／旋转攻击及副手攻击回退 YSM 内置逻辑。副手物品不隐藏、不禁用，也不要求空副手。
- `query.life_time` 为绝对渲染时钟，同帧重复求值不重复推进或重取起点。剑仍使用已验收的 `0.5 / attack_speed`、原横砍尾段和0.55秒突刺归位。斧在当前 `upswing_multiplier = 0.5`、`attack_interval_cap = 2` 配置下独立计算 `max(1, round(max(2,20 / attack_speed) × 0.15)) / 20` 秒前摇，并在起手锁定；20 tick冷却对应3 tick。该公式不声称覆盖其他数据包、倍率或自定义速度修正。
- 剑连击继续缓存各上半身旋转／位置通道并短混合。斧握柄期间改为共享核心轨迹参数：右左切换、同名重启和中断都沿同一条离线 IK 轨迹重定时，不做逐骨骼角插值，也不使用控制器交叉淡化维持握柄。抓柄前和松柄后才使用实际显示姿态缓存；名称空档不立即松柄，新攻击可在停留、松柄或归位中接管。
- 模型斧路径隐藏普通 locator 和剑替身、显示 `Rightfutou` 并固定局部旋转；所有普通斧在有效攻击期间也使用特制模型斧；无 Better Combat 时保持原显示逻辑。scale 不参与旋转／位移的中性补零。所有新增通道仅属于 `UpBody` 子树，不写根、骨盆或腿脚，包括零值占位。
- YSM 2.6.5 不支持 Bedrock 的 `anim_time_update`，因此运行资源使用自定义函数和曲线表达式，不依赖编辑器时钟。

## 编辑

`authoring/better_combat.keyframes.json` 是已验收剑关键帧正本，保持原样。`authoring/better_combat_axe.keyframes.json` 独立保存共享斧核心与模型斧／普通物品的方向片段；`authoring/better_combat_axe.json` 定义动作映射、当前配置下的计时、真实导出阶段点和握点误差合同。`tools/build_combat.py` 合并生成运行曲线，斧核心只作编译输入，不注册成额外攻击。

斧作者脚本使用 `LeftForeArm` 内的左拳中心作为虚拟末端，先定义斧头及两个握点的世界轨迹，再求解真实左右臂；左臂不可达时调整右手路径，不拉伸手臂。编辑器工程、脚本和预览规则见独立美术工作区。导出斧时只写斧关键帧文件，不能改写剑文件或生成的 `animations/better_combat.animation.json`。

```sh
python3 tools/build_combat.py
python3 tools/build_combat.py --check
npm ci --ignore-scripts
npm test
python3 tools/test_ysm.py --java <Java21> --ysm-jar <YSM-2.6.5.jar> --libraries <NeoForge-libraries>
```

修改关键帧后重新生成模型内运行曲线和更新函数的姿态快照块，保留 `functions/`、`controller/` 与 `ysm.json`。

## 安装与验证边界

将本仓「工程师酒狐」整个文件夹放入 YSM custom 目录；首次安装也需把根目录 LICENSE、NOTICE.md、ASSET_LICENSE_CN.md 随模型保存。停机备份现有模型，保留自己的修改后替换，不在运行中的游戏资源目录内制作模型。

独立 Node 回归共24项：原13项覆盖剑路由、时钟、曲线、单击尾段和三动作连击；斧11项覆盖斧两种显示路径、引号／回退、tick前摇、单击顺序、左右及同名连击、中断重启、显隐和上半身所有权。独立 FK 对生成运行曲线的关键帧间采样重建 Blockbench 作者坐标，对完整双向核心轨迹及中间帧采样，左拳／第二握点误差须低于0.2上限，并检查手掌连续性和肘部姿态。该坐标逆转换不冒充游戏画面。

`test_ysm.py` 使用外部提供的官方 YSM 2.6.5 JAR 中真实解析器／求值器，不启动 Minecraft、不分发 JAR。除原10个剑路由／回退用例外，斧另有13个路由用例及前摇、单击、连击、松柄重启和非脚本动画通道策略检查。Minecraft 输入由适配器提供，实际物品分类与客户端画面仍须游戏内核实；反射入口绑定该发行版的混淆名称，升级 YSM 时必须复核。

自动检查不能代替客户端战斗验收。重点检查六种原版斧的实际握点和重影、单击先松左手再归位、连续左右砍不脱柄且不经过 idle、末刀完整收势、命中／音效／粒子与斧刃经过目标区域一致，以及剑横砍／突刺无回归。普通物品模型的最终第三人称变换、副手物品显示和移动中的下半身也须实际观察。

普通第一人称持物不是本适配单独替换的渲染路径。First-person Model 可显示玩家本体，但不新增该依赖，头部遮挡和物品重复绘制仍按实际客户端验证。

参考：[Better Combat 联动](https://ysm.cfpa.team/wiki/animation/better-combat/)、[自定义函数](https://ysm.cfpa.team/wiki/molang/script/)、[控制器回退](https://ysm.cfpa.team/wiki/controller/)、[动画变速限制](https://github.com/YesSteveModel/YSM-Wiki-Issues/issues/317)。

本 fork 修改内容仍遵循原素材 CC BY-NC-SA 4.0，原作者署名与附加素材声明保持有效；代码和动作资源不以不同许可覆盖原美术许可。

已确认斧姿态源为美术备份提交0849fda：齐肩后倾蓄力，斜砍至腰胯以下并前倾，低位停顿后同侧上举，等待反向输入或先松左手再归位。刃口以倾斜切面构造朝向，不提前翻回来路。运行时余势0.12秒、低位停顿0.28秒、上举0.6秒、高位至少停留0.25秒；左手松开0.2秒后双臂0.65秒归位。Better Combat 仍决定下一刀，无后续输入不自行挥砍。

作者秒数导出先用 tools/import_axe.py <独立导出> 按配置显式重定时，再运行 build_combat.py。高密度斧曲线按平衡条件树选择片段，避免逐帧线性扫描数百个区间；剑曲线生成保持原样。原生回归同时核对完整复合斧通道的取样值（夹具内联已另验的线性助手，避免依赖客户端函数注册）。
