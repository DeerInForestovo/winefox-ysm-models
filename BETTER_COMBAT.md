# Better Combat 动作适配

工程师酒狐模型适配 YSM 2.6.5／Better Combat 2.4.0（Minecraft 1.21.1 NeoForge）。最低需要 YSM 2.6.3 的 `ysm-builtin` 回退状态。

- 主手剑的 `one_handed_slash_horizontal_right`／`left` 复用原作者左右挥砍姿态；`one_handed_stab` 使用新增的 idle 起手、微转抬剑、落剑瞄准、回转前送、分层收势并回到 idle 的动作。识别的是 Better Combat 当前动作名，不计数第三刀。兼容运行时名称被一对双引号包裹的情况，仅接受三个已知名称的精确裸值或精确带引号值，未知名称仍回退。保留模型原有的机械武器替换。
- 未安装 Better Combat、未知动作、非剑及副手攻击回退 YSM 内置逻辑，原始动画文件保持原样。未承诺双持、非剑、附属自定义连招的专用动作。
- `player_update` 区分起手／命中、停留和归位。起手按攻击速度，默认剑命中在半个冷却周期；横砍尾段恢复原动画 `.25 → .75 → 1 → 1.4167 → 1.5` 的秒数节奏，不再挤进同一冷却周期。Better Combat 动作仍活跃时最多播放至归位前；空输入留出 0.12 秒衔接窗口，再按原停留和归位时间收势。突刺保持已验收姿态，独立使用停留与 0.55 秒归位。
- 连击不等待归位，也不从 idle 重启。下一刀跳过归一化 `0 → 0.2083` 的 idle 起手段，从上一帧实际显示的上半身局部姿态短混合到新动作；包括左右横砍、突刺、同名重启和短空档。每个旋转／位置通道缓存显示值，编译器统一补齐三动作的上半身通道，避免突刺专有位移在下一刀瞬间消失。混合不超过 0.12 秒，并随攻速缩短；命中时刻不因跳过 idle 改变。
- `query.life_time` 为绝对渲染时钟，同帧重复求值不重复推进或重取混合起点。未知动作、换武器、副手仍立即回退。Better Combat 自定义前摇比例、速度修正、超低帧率漏掉挥动重启或多人远端时序仍须客户端验证；不读取或修改伤害和命中判定。
- YSM 2.6.5 不支持 Bedrock 的 `anim_time_update`，因此运行资源使用自定义函数和曲线表达式，不依赖编辑器时钟。

## 编辑

`authoring/better_combat.keyframes.json` 是归一化可编辑关键帧正本；新增突刺为本 fork 的原创适配，横砍派生自原模型 `main.animation.json` 的两组姿态。突刺运行时逐段保留已烘焙关键帧的线性插值；仅控制 UpBody 及其子树，不写根节点、骨盆或腿脚通道（包括零姿态），保留移动动画的下半身。肩肘逆解与腕部补偿使躯干回转时武器仍朝前。横砍使用四点 Catmull-Rom，任一相邻端点标记即启用曲线；相同值的两个端点仍保留邻点切线，不再逐关键帧强制减速。端点邻点钳制，原关键帧及突刺保持不变。

```sh
python3 tools/build_combat.py
python3 tools/build_combat.py --check
npm ci --ignore-scripts
npm test
python3 tools/test_ysm.py --ysm-jar <YSM-2.6.5.jar> --libraries <NeoForge-libraries>
```

修改关键帧后重新生成模型内 `better_combat.animation.json` 及更新函数的姿态快照块，并保留模型内 `functions/`、`controller/` 与 `ysm.json`。不要用编辑器关键帧文件覆盖生成的运行资源。

## 安装与验证边界

将本仓「工程师酒狐」整个文件夹放入 YSM custom 目录；首次安装也需把根目录 LICENSE、NOTICE.md、ASSET_LICENSE_CN.md 随模型保存。停机备份现有模型，保留自己的修改后替换，不在运行中的游戏资源目录内制作模型。

`test_ysm.py` 使用外部提供的官方 YSM 2.6.5 JAR 中真实解析器／求值器，检查三个动作的裸值／带双引号值、回退、渲染时钟／同帧幂等性、空输入收势／同名重启、真实线性／Catmull-Rom 插值，以及按动画通道模式解析的姿态缓存／混合；不启动 Minecraft，不分发 JAR。Minecraft 输入由适配器提供，主手物品查询在游戏中核实。回归能捕获该版本对无代码块条件赋值的差异，避免仅依赖独立 Molang 解释器。反射入口绑定该发行版的混淆名称，升级 YSM 时必须复核测试适配器。

自动检查与原生服务端资源注册不能代替客户端战斗验收。重点检查横砍→横砍→突刺、断连后重新起手、攻速变化、换武器，以及没有 Better Combat 时的原动作。

普通第一人称持剑不是本适配覆盖的渲染路径。YSM 的 fp_arm 在持物时不显示；First-person Model 可使第一人称看到玩家模型本体，但需另测头部遮挡、镜头高度、手臂和物品的重复绘制。本 fork 不新增该依赖。

参考：[Better Combat 联动](https://ysm.cfpa.team/wiki/animation/better-combat/)、[自定义函数](https://ysm.cfpa.team/wiki/molang/script/)、[控制器回退](https://ysm.cfpa.team/wiki/controller/)、[动画变速限制](https://github.com/YesSteveModel/YSM-Wiki-Issues/issues/317)。

本 fork 修改内容仍遵循原素材 CC BY-NC-SA 4.0，原作者署名与附加素材声明保持有效；代码和动作资源不以不同许可覆盖原美术许可。
