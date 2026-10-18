# Composer Workflows

## 教程逐步骤录制

`workflows/composer/guidebook-request.workflow.ts`复用现有真实driver与loopback origin，按用户操作逐步记录正式App窗口。先核对Release资产SHA-256，再通过`INTERCEPTOR_E2E_MACOS_APP_PATH`启动对应产物；保持App当前语言，不使用设计fixture、Store或Preload业务注入。

流程从打开Composer、新建请求、填写自产URL、Send、响应Headers、Query/Header字段、Auth和Recent sends到响应正文。每一步先断言真实状态，再保存该步原生窗口截图并记录视频时间；示例字段固定为`guide=composer-demo`和`x-interceptor-guide: composer-demo`，动态origin端口以实际录制清单为准。原始视频与截图不自动发布，先核对对应文案、隐私及版本；录制不改变原有Close、进程/8888释放与宿主恢复门禁。

该录制证明对应步骤，不把短录制扩大为Composer全部功能、所有平台或原生导入导出均已完成。macOS 15+的ScreenCaptureKit按窗口ID隔离录制，`INTERCEPTOR_GUIDE_RECORDER`指向由`fixtures/ui/macos-guide-recorder.swift`编译的验收工具；`INTERCEPTOR_GUIDE_FFMPEG`指定已安装后处理编码器。两者都不进入产品包，不给产品添加录制参数或运行依赖。

`guidebook-editing.workflow.ts`补充JSON/Text/Form的实际出站字节、空认证控件、命名、目录拖动和原生Collection文件往返。每种正文使用独立测试路径，避免`observation()`的首条记录语义误判后续发送；编辑已有URL时按正式输入框只修改主机/路径，不重复已经单独显示的协议前缀。不录入或展示真实凭据。

`guidebook-auth.workflow.ts`仅用临时127.0.0.1服务接受的公开演示字符串，实录None的401、Basic/Bearer的200、切None后自动Authorization移除，以及自行添加的Authorization必须单独删除。它不是商业服务或真实凭据验收；最后清空三种演示输入、保持None，并确认Composer没有写入Capture。源站逐次检查实际Header，关闭服务与App后按原driver核对退出恢复。

`guidebook-tools.workflow.ts`补录Composer专用MCP Ask与Collection读取/替换，不改产品代码。解锁后已在同一签名Release取得[真实操作、原生媒体及退出证据](../../../test-results/guidebook-media-20261016/prepared-unlocked/composer-guidebook-tools.w-439f3-iven-Collection-replacement-macos-guidebook/)；该流程通过不代替其他未录的深字段跨重启或原生集合文件Tool。

- 前提：只使用产品UI创建的独立Ask Client和官方本地SDK；配置凭据只留在内存并登记脱敏，取景前进入Settings，不让默认Capture背景流量进入画面。保持App语言。
- UI输入：在Composer创建并命名`Guide UI request`，URL为本轮自有`/guide/composer-tools/saved`，Header为`x-guide-collection: public-example`；通过UI Send得到`guide-ui-response`。等待`data-save-state=saved`后，读取真实request ID与revision，不预造节点树。
- 发送审批：SDK请求`composer_send_request`，method为POST，独立路径`/guide/composer-tools/allowed`，Header为`x-guide-tool: public-example`，body为`{"message":"guide-tool-request"}`，protocol为`http/1.1`、timeoutMs为5000。先Deny且源站零请求，再次请求并Allow；真实源站核对method/Header/body，实际Tool结果为201、`HTTP/1.1`和`guide-tool-response`，无不完整正文。
- 显示边界：返回仍选中的Composer请求，URL和`guide-ui-response`保持。Tool发送结果在调用方，不伪造Composer响应区，也不借用手工Send图冒充Tool返回。
- Collection：`composer_get_collection`实际读取UI保存的完整树；用返回的revision/原节点身份只修改name为`Guide MCP renamed request`。记录Ask当前/目标请求及目录计数，先Deny核对revision和UI不变，再Allow核对revision递增与已挂载UI通知更新。保留原URL、Header和UI响应；读取/替换不新增源站请求。
- 证据与清理：逐步骤原生截图/视频/字幕、独立网络事实与Tool结果断言，最后关闭本轮MCP Server，沿原driver正常Close与宿主恢复。失败片段、锁屏拒绝、单纯typecheck或`--list`都不能算真实E2E通过。

本次原图/字幕对应22个实际步骤；UI保存的revision从4变为5，Tool发送返回201而当前Composer响应仍为先前UI Send的200。Main `8102`、Core `8157`正常退出，`gracefulDestroyVerified=true`、`abruptDestroyVerified=false`，8888已释放后才把真实截图窗口交接给item10。SDK不是商业Host界面，输入Header/Body均为本轮公开示例。

`guidebook-fields.workflow.ts`核对Header/Query行启用、停用、删除后的实际重发，JSON Format、Body None及Recent sends只恢复method/URL的边界。`guidebook-collection.workflow.ts`从真实UI建立三级目录，在第三级菜单检查继续嵌套禁用，创建和切换两条自产请求，再核对目录改名、同级排序、原生导出/导入预览取消及本轮节点删除。所有操作都附独立步骤图，导入文件由同轮产品Export生成；锁屏拒绝不作为流程通过。

`guidebook-request-persistence.workflow.ts`补完整代表性请求的深层目录跨重启，不重复已有目录管理影片。前提目录通过真实UI创建，第一段只录请求字段：POST、HTTP/1.1、本轮`/guide/persisted-request?guide=url`、启用的`x-guide-persist: retained`、停用的`x-guide-disabled: omitted`、Query `scope=retained`、JSON `{"message":"persisted-fields","count":2}`和只供公开示例的Bearer值`public-persistence-example`。等待实际保存后正常Close；第一代不得Send。

第二代同profile真实重开，取景前先进入Composer，逐层展开三个实际保留的目录，检查同一request ID、name、URL、method、protocol及各字段/开关。不重新填写保存字段，最后仅点一次Send；真实源站必须收到POST、两个Query值、启用Header、JSON字节和演示Authorization，不收到停用Header，也没有重启自动重发。随后清空演示Auth并选None。两段分代记录、分别核对正常退出；第二代证据前缀为`composer-reopened`。这是一条完整选用字段的代表性请求，不宣称穷举所有Body/Auth类型组合；真实运行前只登记待验证，不发布素材。

`guidebook-response-formatting.workflow.ts`只补现有Composer响应影片未覆盖的HTML/JavaScript自动格式化、XML失败保留原文与超过2MiB的JSON预览，不重复已录CSS手动Format和分栏。四条请求通过UI分别命名，源站路径各自独立；小HTML的Copy须含真实格式化换行，JavaScript核对格式化空格与原文不同，不强求短函数换行。`<root><`的真实HTTP响应在手动Format后仍逐字保留且无新增Renderer异常。大JSON由自有origin返回，Copy只含2MiB预览且Format disabled，不造导入文件。最后切回原HTML请求核对格式化视图仍在。每步原生图/字幕、Clipboard摘要与真实源站次数分别保存，正常退出走原guard；未运行前不能声明媒体通过。

`guidebook-file-tools.workflow.ts`准备补录Collection文件Tool：产品UI创建并保存一条公开请求，官方本地SDK以Ask调用Export/Import。先Deny并核对不写文件，再Allow后通过真实Save取消；随后由产品Tool导出唯一`guide-tool-collection.json`，所有Import只读取这个文件。分别记录Open取消、导入预览取消、预览确认追加；最后选择Auto并再次导入，仍需真实Open和预览确认，三份同名请求保持独立新ID、原请求ID不被替换。请求及Header由同一UI生成，无真实凭据；所有文件操作不自动Send。原生面板先定位自有临时目录再取景，取消由真实键鼠完成；未运行前只标代码准备，不发布素材。

### 独立响应检查与实际重发补录

`guidebook-inspection.workflow.ts`与`guidebook-replay.workflow.ts`只补教程媒体，不修改产品行为，也不替代其他Composer契约的验收。当前目标是macOS正式Release `0.1.1-alpha.1`；每条独立profile、trace与loopback origin，等待真实App/Core/8888后录制，保持App当前语言。每个具体操作经`media.step()`独立保存窗口截图、时间戳与字幕，使用`composer-inspection`和`composer-replay`命名，不覆盖既有素材。

- 响应检查：新建GET请求，输入自产`/guide/composer-inspection/response`地址，逐字段添加`x-guide-request: inspection-demo`后Send。真实origin返回`x-guide-response: inspection-demo`、两条`guide_session=inspection-demo` / `guide_theme=light` Cookie和含`Hello response`、`guide-001`、`demo-001`的JSON。分别打开Headers、Cookies、Timing，独立记录Response Headers、Request Headers、Cookies、Timing、Connection的折叠与展开，检查真实响应与连接信息；明文HTTP不冒充TLS握手证据。
- 正文与布局：返回Body，切Tree、折叠/展开根节点、打开`message`右键菜单并复制值，再切Raw、复制原文、切Hex、复制字节、进入和退出Fullscreen。Copy只读核验真实按钮产生的剪贴板内容；不预写剪贴板。用真实pointer分别拖宽Collection和增高响应区，记录前后几何，确认当前响应保持。
- 手动Format：只修改已有URL的host/port/path，向独立`/guide/composer-inspection/format`发送请求。响应为`.guide{color:teal}`及其后的1,048,576个ASCII空格，超过1 MiB自动格式化阈值但仍可完整格式化。先Copy证明未格式化原文，再点击Format与Copy核对分行结果；不能以小响应自动格式化的最终画面替代手动Format步骤。
- 重复Query：新建POST，URL填`/guide/composer-replay/query?guide=url`；确认Query表格初始不因URL自动生成行，再逐字段添加两条同名`guide=table`、`guide=again`。Send必须由真实origin观测到`guide=url&guide=table&guide=again`，URL输入仍保留原值，不把追加描述成替换或双向同步。
- Text中间态：改为独立`/guide/composer-replay/text?guide=text-url`与PUT，分别记录打开Body、选择空Text、输入`Hello`、补齐`Hello text`及Send。输入阶段不新增origin请求，发送后核对完整字节。Text不自动增加`Content-Type`；未手工填写时origin没有该Header，控件上的`text/plain`不能当作实际出站Header。
- Recent sends实际重发：将当前Query的`table`改成`current`，正文改成`Hello replay`；单独记录打开历史菜单、选择旧POST地址、检查当前Query、再次Send。历史恢复已组合的旧URL与method，当前Query/Body不恢复；预期origin收到`guide=url&guide=table&guide=again&guide=current&guide=again`及`Hello replay`。三次完整path各不相同，并核对origin记录总数，避免`observation(path)`只返回首条记录产生假通过；如Release行为不同，保留真实证据并标明限制。

两条均保存逐步骤清单、原生视频、字幕、独立origin/剪贴板/几何证据以及原driver的`trace.zip`、日志、`metadata.json`。macOS Release的[响应检查实录](../../../test-results/guidebook-media-20261015/composer-inspection-complete/run-01/composer-guidebook-inspect-563c5-views-actions-and-splitters-macos-guidebook/)和[实际重发实录](../../../test-results/guidebook-media-20261015/composer-inspection-complete/run-03-replay/composer-guidebook-replay.-42eae--actual-Recent-sends-replay-macos-guidebook/)已核对上述数据面结果与代表性原图、视频帧。原driver通过`shell.window.close`正常关闭，进程退出、8888释放及宿主代理/证书恢复门禁通过；未强杀，不扩大为Windows、TLS或整个Composer的验收。

取景只包含workflow所属App窗口：原生视频使用`SCContentFilter(desktopIndependentWindow:)`，逐步骤截图使用`screencapture -l <windowID>`；这两条没有原生文件面板，也没有显示器、桌面或区域录屏。录制保持`zh-CN`，没有为截图切换语言。

**已发布UI限制**：当前中文Release把Text档标签显示成`composer.text`。输入中间态、完整字节与重发功能已验证，但正常翻译标签的素材仍为`blocked`，需要独立产品修复授权及相应Release；原图和视频保留实际标签，不修图、不切语言绕过，不把本次功能通过写成缺译已修复。Text未手工设置时不发送`Content-Type`、历史已组合URL再次追加当前Query也必须按实录描述，不能写成自动Header、覆盖同名参数或恢复完整历史草稿。

本文件定义 Composer 工作区的完整 E2E 流程。每条 workflow 独立启动 Electron、独占 profile/trace，并使用真实 Composer UI 和本地 origin。

macOS原生文件选择由共享fixture读取完整GoTo路径、真实双击唯一目标建议项，再用原生Save/Open或Cancel按钮完成；不以窗口消失代替文件结果。完整产品输出、预览确认/取消、重启和宿主恢复断言保持，当前输入法与应用语言不切换。

Composer 由 Core 直接出站，不依赖系统代理路由。因此这些 workflow 只验证 Proxy readiness 的相关默认态（listener=8888、System Proxy未owned、UI Paused），随后点击 `capture.readiness.cancel`，并确认未修改系统设置。它们不重复检查无关的 Capture rows、Rules、Breakpoints、Privacy、CA 或 Updates 状态。

<a id="composer-tools-collection"></a>
## `composer.tools.collection`

**状态**：passed
**策略**：shared；两代真实Electron；host-safety-guard

### Steps

1. 使用独立profile启动真实Electron；经Composer UI建立两条请求和一级目录，编辑URL、enabled字段行、正文
	与测试自产Auth凭据，等待既有自动保存。经Settings UI配置本地Provider，敏感输入不进入trace或产物。
2. Ask Chat先discovery再调用`composer_get_collection`，确认版本、完整树身份、层级、顺序与请求编辑状态；
	无审批和网络请求，Auth/Header/Query/URL凭据已脱敏。
3. 用查询所得树构造名称/字段修改，Ask调用`composer_replace_collection`；审批只显示请求/目录数量，Deny后
	Core、UI和revision不变。再次Allow后当前已挂载Collection立即同步同一批身份与新内容。
4. 切Auto再次替换，确认不出现审批；随后使用旧revision拒绝覆盖。读取/替换往返保持原凭据，不把遮罩落库；
	从当前UI检查真实Auth与字段值，并确认没有隐式Send或Capture记录。
5. 通过Settings关闭Agent两项权限，旧Chat调用被拒绝；MCP权限独立，产品UI创建的MCP Client可读取并在
	自身Ask/Auto规则下替换。MCP撤权后当前连接不再披露或执行两项。
6. 正常关闭首代并验证完整系统恢复；同profile重启后集合、revision和授权设置保持，Model/origin请求增量0。
	记录两代Main/Core/Worker销毁、8888释放、WinINet/journal恢复与脱敏evidence。

### 预期与证据

Red必须来自新Tool缺失或外部替换UI未同步，不能来自selector、凭据或环境问题。完整结构/非法字段、重复ID、
越界目录和不能由产品生成的输入归owning unit。真实流程证明查询静默、审批有效、原子替换、凭据保留、授权
和重启零重放；不得以fake Preload或Core integration代替本条Electron workflow。

- Main保存方法重构保持以上流程不变，前后均须取得同一workflow Green。
	- UI保存通过IPC返回值确认快照，不因自己的变更通知重新加载正在编辑的内容。
	- Tool保存完成后由同一Main方法通知Renderer；不在Tool分派中另写广播步骤。

- 所有测试均等待公开保存状态，不用固定时间掩盖未保存或吞掉Renderer错误。

<a id="composer-tools-transfer"></a>
## `composer.tools.transfer`

**状态**：passed
**策略**：native-ui；Windows；两代真实Electron

### Steps

1. 空profile启动真实Electron，经Settings配置Provider，Ask Chat发现导出/导入两项。通过Composer UI创建两条请求
	及目录，编辑Header/Query/JSON/Form/Auth并等待自动保存；产品UI Export经真实Save Dialog产生唯一输入文件。
	测试不得直接构造业务文件或写storage。
2. Ask Deny不打开原生Dialog；Allow导出后真实Cancel不生成文件，
	再次Allow选择路径保存，读取产品输出核对完整已保存树。结果仅含exported，不包含路径或内容。
3. Allow导入先取消原生Open，再选同一产品文件并取消预览，均不改revision或集合。再次确认导入后立即追加，
	节点ID与所有Header/Query/Form行ID全部新生成，层级、顺序及凭据保留，不隐式Send。
4. Auto导出仍经真实Save，Auto导入仍经真实Open与预览确认。重复导入继续追加，不覆盖既有集合；自动保存与
	导入确认不能竞态覆盖，前后revision正确推进。
5. 关闭Agent两项权限后旧Chat被拒绝；MCP独立权限开启时使用产品UI创建的Client验证Deny、Allow、原生选择及
	预览取消/确认，再关闭MCP权限并确认旧连接不能继续执行。
6. 正常退出并复用profile重启，集合/授权保持、Model及文件操作零重放。两代Main/Core/Worker全退、8888释放、
	WinINet/journal恢复，完成trace/evidence后才删除产品产生的临时文件和profile。

### 预期与证据

Red必须来自两项Tool尚未实现，不能使用原生Dialog定位失败作为产品Red。业务输入全部经同workflow产品UI
产生；文件级非法输入与取消/保存竞态的内部边界由unit覆盖。所有结果与证据不包含路径、正文、Auth或Token。

<a id="composer-request-edit"></a>
## `composer.request-edit`

**状态**：passed
**策略**：shared

### Steps

1. 创建本 workflow 独占的空profile、evidence目录和HTTP loopback fixture；只读确认宿主没有遗留的Interceptor system-proxy ownership或测试CA。
2. 启动独占trace，再用 `_electron.launch()` 启动新的Electron和该profile。
3. 等待 `app.root`、Core Running/真实PID和listener `127.0.0.1:8888`；确认readiness显示System Proxy off、UI Paused/Not recording。
4. 点击 `capture.readiness.cancel`，确认modal关闭、System Proxy仍未owned；点击 `shell.workspace.composer`。
5. 只检查Composer相关默认态：method=GET、URL=`https://`、protocol=Auto，`accept:*/*`与`user-agent:Interceptor/1.0`两个headers均enabled，body为空、auth=none、request tab=Headers、response/history为空。
6. 通过 `composer.method` 依次选择GET/POST/PATCH；在 `composer.url` 输入带重复query的loopback URL。
7. 依次点击 `composer.protocol.auto/h1/h2`，确认selected状态后回到Auto。
8. 在Headers tab添加、编辑、disable、删除header；在Query tab添加/编辑/删除参数并确认URL双向同步；在Body tab输入JSON。
9. 在Auth tab依次选择none/bearer/basic并填写token或username/password；切换tabs确认草稿不丢失。
10. 保存 `final.png`、`trace.zip`、Main/Renderer日志和metadata；点击 `shell.window.close`。
11. 验证Main、Renderer、Core、Worker全退且8888释放；关闭HTTP fixture并删除profile。

### 预期效果

Composer的method、URL、protocol、headers、query、body和auth均从默认态通过真实UI编辑；URL/query双向同步；tabs不丢草稿；整个流程不修改系统代理或其他feature状态。

<a id="composer-collection-tree-interactions"></a>
## `composer.collection.tree-interactions`

**状态**：passed
**策略**：shared

### Steps

1. 创建独立profile、trace与evidence；启动本地production Electron并等待App/Core/8888，fresh-profile readiness只执行Cancel，不修改系统代理。
2. 进入Composer，从Collection toolbar新建根目录并在行内input命名；通过目录More菜单连续新建第二、第三层目录，每层记录公共动态ID与行几何。
3. 打开第三层目录菜单，确认New subfolder为disabled；从同一菜单新建request，填入测试自产URL。
4. 对request行发起真实contextmenu，选择Rename并在同一行内input提交；立即切到Rules再返回Composer，越过600ms保存窗口后确认rename与URL仍由Core恢复，且request ID不变。
5. 点击根目录作为新建落点，确认目录`aria-pressed=true`但URL editor仍保留当前request；点击`composer.collection.tree`空白，确认只清目录选择且URL仍不变。
6. 拖动`composer.collection-splitter`，确认Collection宽度线性变化且当前request/目录树保持可用。
7. 核对首层嵌套目录缩进30px、再下一层增加26px；方法标签在40x16px框内以flex双轴center居中文字，标签框与标题中心对齐，文字上下/左右留白差均不超过一个设备像素。附加目录ID、缩进、菜单disabled、remount persistence、selection、URL、splitter与标签文字几何；正常Close并验证Main/Core/Renderer退出、8888释放和profile删除。

### 验收要求

- 新增或修复交互行为时先取得同一workflow的有效Red；行为与数据格式不变且现有覆盖足够时，确认基线Green后再修改并复跑，不回滚或制造历史Red。
- 有效Red必须来自selection、rename、三级约束、menu或splitter业务缺口；selector、构建、listener或fixture失败不算Red。
- Green必须覆盖同一组UI操作、evidence与完整销毁。

### 预期效果

目录落点与打开文档正交；行内重命名不替换节点身份；三级限制在菜单和store一致；splitter只改变布局，不改变业务状态。

<a id="composer-send-success"></a>
## `composer.send-success`

**状态**：planned
**策略**：shared

### Steps

1. 创建空profile、evidence目录和返回JSON/custom headers/两个cookies的HTTP fixture；确认宿主无遗留Proxy ownership和测试CA。
2. 启动独占trace与新Electron，等待App root、Core Running和8888 listener。
3. 确认readiness=System Proxy off、UI Paused；点击 `capture.readiness.cancel`，确认系统设置未修改；进入Composer。
4. 只检查Composer默认态：GET、`https://`、Auto、两个默认enabled headers、空body/auth/response/history。
5. 通过UI填写POST、fixture URL、`x-interceptor-e2e-request`、JSON body和Basic或Bearer auth。
6. 点击 `composer.send`，确认按钮进入Sending并暂时disabled。
7. 等待200/OK响应，检查duration、bytes、HTTP version、remote address和TLS summary。
8. 依次打开Body/Headers/Cookies/Raw response tabs，验证JSON、custom response header、两个Set-Cookie与Raw status/header/body完全一致。
9. 确认History新增一条真实记录，且System Proxy仍未owned。
10. 保存evidence并点击 `shell.window.close`。
11. 验证进程/8888销毁，关闭fixture并删除profile。

### 预期效果

Composer通过真实Core直接出站；sending和终态准确；四个response视图共享同一真实响应；无需Enable system proxy，也不会产生Capture副作用。

<a id="composer-response-section-collapse"></a>
## `composer.response.section-collapse`

**状态**：passed
**策略**：shared

### Steps

1. 创建独立profile、trace和HTTP loopback origin；启动本地production Electron并等待App/Core/8888，fresh-profile readiness只执行Cancel，不修改系统代理。
2. 进入Composer，通过`composer.collection.new-request`创建请求，在`composer.url`填写`/e2e/composer/response-section-collapse`并点击`composer.send`；确认真实origin收到GET。
3. 打开`composer.response-tab.headers`，用`composer.response-section.response-headers`与`.request-headers`定位两段；确认初始`aria-expanded=true`，`aria-controls`分别指向`hidden=false`的唯一正文。
4. 依次折叠两段，再重新展开Response Headers；确认同一`aria-controls`正文恢复，每次只切换目标正文的`hidden`与对应按钮的`aria-expanded`，另一段状态保持不变。
5. 保存截图、trace、日志与metadata；正常Close并验证Main/Core/Renderer退出、8888释放和profile删除。

### 预期效果

Response Headers、Request Headers、Cookies、Timing与Connection沿用同一可折叠section语义；折叠不销毁正文内部状态，也不依赖当前语言文本定位。

<a id="composer-response-body-formatting"></a>
## `composer.response.body-formatting`

**状态**：passed
**策略**：shared

### Steps

1. 创建独立profile、trace和HTTP loopback origin；启动本地production Electron并等待App/Core/8888，fresh-profile readiness只执行Cancel，不修改系统代理。
2. 通过Composer UI发送完整且不超过1 MiB的单行HTML响应；等待自动Format结束，点击公共Copy动作并从系统剪贴板确认正文已分行且内容保持。
3. 新建请求并发送小JavaScript响应；确认自动Format补齐空格且Copy读取当前model。
4. 新建请求并发送完整1–2 MiB的单行CSS响应；Format前Copy确认原文无换行，点击公共Format动作，等待busy结束后再次Copy并确认已分行。
5. 新建请求并发送无法解析的XML；记录Renderer page errors，点击Format后确认原文逐字节不变、按钮恢复可用且未新增未处理page error。
6. 不再点击Format，切回此前CSS request；Copy必须仍返回该response的4行格式化视图，证明格式化副本按文档隔离且未改写原始body。
7. 附加四段正文摘要、CSS恢复摘要与Renderer错误增量；正常Close并验证Main/Core/Renderer退出、8888释放和profile删除。

### 验收要求

- unit必须验证formatter异常返回原文，不向调用方泄漏异常。
- 真实Electron不得出现格式化内容错误或未处理Renderer error；selector、fixture、构建或listener失败不算产品故障。
- 同时覆盖HTML/JavaScript自动格式化、CSS手动格式化、跨文档恢复、XML失败回退以及完整销毁。

### 预期效果

code正文按语言使用既有formatter；自动与手动路径共享同一结果语义；失败不改正文、不解锁编辑器、不留下busy或未处理Renderer错误。

<a id="composer-send-failure"></a>
## `composer.send-failure`

**状态**：planned
**策略**：shared

### Steps

1. 创建空profile、evidence、有效HTTP fixture和一个未监听的loopback端口；确认宿主无遗留Proxy ownership/测试CA。
2. 启动trace与新Electron，等待Core Running和8888；点击 `capture.readiness.cancel`并确认System Proxy未owned；进入Composer。
3. 检查Composer默认URL/method/protocol、空response和空history。
4. 输入格式非法URL并点击Send，验证有界validation/error、无假response且Send恢复可用。
5. 输入未监听端口的合法URL再次Send，验证连接失败信息与duration，response区域无伪成功内容。
6. 改为真实fixture URL并再次Send。
7. 验证旧error清除、显示200真实响应，History准确反映发送终态。
8. 确认失败/重试未修改System Proxy，也未创建无关Rules或Breakpoints状态。
9. 保存evidence并点击 `shell.window.close`。
10. 验证进程/8888销毁，关闭fixture、释放端口并删除profile。

### 预期效果

非法URL和网络失败不会产生成功假象或锁死表单；修正后可立即重试成功；错误只影响Composer当前请求状态。

<a id="composer-history-new"></a>
## `composer.history-new`

**状态**：planned
**策略**：shared

### Steps

1. 创建空profile/evidence和HTTP fixture；启动trace/Electron，等待App/Core/8888/readiness；检查System Proxy未owned，点击 `capture.readiness.cancel`并确认系统设置未修改。
2. 进入Composer，确认默认history为空、编辑器为GET/`https://`/Auto。
3. 通过UI发送GET请求A和POST+body请求B。
4. 打开History，确认两个动态rows按时间降序且method/URL/status准确。
5. 依次选择A、B，确认method、URL、headers、query、body、auth和各自response完整恢复。
6. 点击 `composer.new`。
7. 确认恢复GET、`https://`、Auto、两个默认enabled headers、空body/auth/response；History中的A/B仍存在。
8. 再加载A，确认New没有删除或串改历史记录。
9. 保存evidence并点击Close。
10. 验证销毁，关闭fixture并删除profile。

### 预期效果

History只保存真实Composer发送；加载恢复完整请求；New重置编辑器和response但不删除history；无系统代理副作用。

<a id="composer-resize"></a>
## `composer.resize`

**状态**：planned
**策略**：shared

### Steps

1. 创建空profile/evidence和返回大JSON/header集合的HTTP fixture；启动trace/Electron，等待App/Core/8888/readiness；检查System Proxy未owned，点击 `capture.readiness.cancel`并确认系统设置未修改。
2. 进入Composer，确认默认splitter布局、method/URL/Send和空response可见。
3. 通过UI发送真实请求并等待大response。
4. 拖动 `composer.splitter` 到请求面板最小宽度，检查method/URL/Send、tabs、header editor和body无重叠。
5. 拖到中间，再拖到response面板最小宽度。
6. 依次打开Response Body/Headers/Raw，确认CodeMirror和长header正确换行或滚动。
7. 再次发送请求，确认动态内容不改变布局轨道、selection或草稿。
8. 恢复splitter到中间位置，确认窗口状态和Core未变化。
9. 保存evidence并点击Close。
10. 验证销毁，关闭fixture并删除profile。

### 预期效果

Composer splitter遵守两侧最小宽度；请求/响应控件在极限宽度可用；resize只影响布局，不影响业务状态或系统代理。

<a id="composer-collection-import"></a>
## `composer.collection.import`

**状态**：Windows真实Save/Open与导入已验；macOS保留既有记录。
**策略**：native-ui

### Steps

1. 创建独立profile/evidence，启动trace与新Electron，等待`app.root`、真实Core PID与`127.0.0.1:8888`；点击`capture.readiness.cancel`并确认系统代理未被修改。
2. 进入Composer，确认Collection为空。通过UI新建两条request并分别填写method、URL与至少一行query/header；再新建一层目录并把第二条拖入。等待600ms节流写入完成。
3. 点击`composer.collection.export`，确认`composer.export.busy`遮罩出现且不可关闭；在真实Save Dialog中用键鼠输入本workflow临时目录下的`.json`路径并确认，等待遮罩消失。测试侧只读解析该文件，断言顶层为`{ nodes }`、目录层级与UI一致、请求字段完整，并记录文件内全部节点与字段行`id`。该文件是本workflow用产品UI真实产生的唯一导入输入。
4. 点击`composer.collection.import`打开真实Open Dialog，确认`composer.import.busy`遮罩存在且底层按钮、Escape、Tab均不可操作；用键鼠选择同一文件并确认。等待`composer.import.dialog`出现，断言其报告的request数与folder数与文件一致。
5. 点击`composer.import.cancel`，直接读取DOM确认`composer.collection.request.*`与`composer.collection.folder.*`数量、顺序与当前打开文档全部未变。
6. 再次导入并点击`composer.import.confirm-apply`；确认写入期间Dialog不可关闭。等待Dialog关闭和revision递增，断言：request总数翻倍；新增节点与字段行`id`均与文件内`id`没有交集；目录层级与文件一致；新增内容整体排在原有节点之后；当前打开的文档与`targetFolderId`不被导入改变。
7. 打开一条新导入的request，确认method、URL、query/header行与步骤2构造的内容逐字段一致，导入保留的是请求内容而非仅节点名。
8. 切出Composer再切回，确认Core回载后的树与新增节点身份一致。
9. 全程只使用公共`data-automation-id`、DOM状态属性与测试自产数据判定，不依赖任一语言的显示文案。
10. 保存trace、截图、导入前后的树快照JSON、日志与metadata；点击`shell.window.close`，验证Main/Core/Worker退出、8888释放并删除profile与临时文件。

### 预期效果

Collection导入与Rules同构：纯新增、节点与字段行`id`全部重新生成、保持文件内层级并追加到根末尾，不覆盖或合并任何本地节点。请求内容逐字段还原，其中`ComposerFieldRow.enabled`作为请求内容原样保留。确认Dialog在写入之前报告计数，取消后集合零变化，确认后经`collection.replace`原子持久化；导入不改变当前打开文档与新建落点。文件读写与确认写入期间均有不可关闭遮罩。因为请求只在用户点Send时执行，导入不产生任何自动网络行为。

### 验收要求

- 必须通过`composer.collection.import`真实入口执行。
- 覆盖取消零变化、id不复用、层级保持、字段还原、打开文档不受影响与Core回载，并完成trace/evidence与销毁验证。
- 导入输入文件必须由本workflow的真实Export产生；出现测试自建输入文件即视为该条Green无效。
