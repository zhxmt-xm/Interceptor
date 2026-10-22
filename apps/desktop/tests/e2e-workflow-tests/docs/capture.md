# Capture Workflows

## 原流程与可选步骤截图

截图通过同一批原Capture workflow的`--screenshots`选项生成，不维护录制专用动作。

- `facets-clear-menu.workflow.ts`在已有Pending、顺序、计数与菜单基础上核对同组OR、跨组AND、关键词和非破坏性清空搜索。Clear后立即断言行及facet计数，再截图，不插入截图延迟掩盖同步边界。

- `body-scenarios`、`body-media-scenarios`、`body-preview-limits`、`body-fullscreen`、`detail-body-fill`及`section-collapse`保持原正文、媒体、阈值、全屏和真实滚轮断言。产品音视频预览不在删除范围。

- `http-scenarios`、`http2-scenarios`、`http2-origin-goaway`、`tls-scenarios`、`websocket-scenarios`、`grpc-scenarios`和`compact-message-layout`保留真实协议及分页。TLS流程复用已有CA，并补HTTPS经Map Remote到另一HTTP端口及停用恢复；不新增CA或系统设置后门。

- `tools-har-transfer.workflow.ts`复用自产记录核对UI全部/筛选/选中实际文件，验证Privacy默认、单次覆盖、未遮罩、去正文与旧文件不变；所有导入仍只选择同流程产品Export的文件。

- Archive、Body和运行中取消分别由`tools-archive-transfer`、`tools-body-export`、`tools-transfer-jobs`拥有；原生Save/Open由共享file-dialog helper在定位本轮目录后拍PNG，取消则拍回到App的状态。

命令、输出清单和显式导入边界见[套件说明](../README.md#trace-与证据)。已有公开PNG及历史验收记录保持原来源，新的运行不会自动替换它们；本节不把未经执行的平台或分支记为通过。

### English App 教学检查点

下列检查点仍属于原workflow，只在已有真实操作和断言的位置调用`screenshotStep`。显式`INTERCEPTOR_E2E_LOCALE=en-US`与`--screenshots`由原入口提供；不切换日常App语言、不改截图文字、不新增教程workflow。每张标注图的`1`绑定标题所述的实际控件或当前可见内容，原图独立保留；采用到教程时，同一编号必须写入该图所在的操作步骤。

| 原workflow | 可提供的操作画面 | Keyword与分组准备 |
| --- | --- | --- |
| [recording-pause-resume](../workflows/capture/recording-pause-resume.workflow.ts) | 搜索自产路径、Recording开启/暂停/恢复、暂停时已录制WebSocket继续收消息、恢复后新连接 | `/e2e/recording-boundary` |
| [body-fullscreen](../workflows/capture/body-fullscreen.workflow.ts) | 自产POST、Headers、空Query、Request/Response、Raw、全屏Copy/Close、全屏Hex与Escape返回 | 逐条使用`/e2e/fullscreen-json`或`/e2e/fullscreen-html` |
| [facets-clear-menu](../workflows/capture/facets-clear-menu.workflow.ts)、[clear-facets](../workflows/capture/clear-facets.workflow.ts) | Method GET/POST组内OR、Status跨组AND、关键词、逐项取消、Clear search、Clear filters、完整Clear记录 | macOS已完整通过：开始Recording后经Settings Restore恢复原路由，控件显示Paused但不能据此推断Core状态；此后不再切换Recording。原显式客户端仍使用8888，完整计数和同帧Clear断言不变 |
| [http-scenarios](../workflows/capture/http-scenarios.workflow.ts) | H1请求选择、Headers、Request/Response Raw、已有SSE和上传/下载进行中状态 | 默认场景使用其原`path`；SSE、上传、下载与413使用`requestPath`，间隔保留`/e2e/http-`；Clear后的新旧请求分别使用自身路径验证 |
| [http2-scenarios](../workflows/capture/http2-scenarios.workflow.ts) | H2 JSON、Headers/trailers、Raw；Range接收前后；错误GOAWAY部分正文及独立恢复行 | 首条`/playground/h2-json`；其余使用原`requestPrefix`，间隔保留`/e2e/h2/` |
| [playground-traffic](../workflows/capture/playground-traffic.workflow.ts) | 两端错误GOAWAY后，原POST的Headers声明512KiB、Response实际保留256KiB | `/playground/h1-json`、`/playground/ws/text`及各`/playground/h2/error-goaway-*`；步骤截图仍只取App，不以Playground页面代替 |
| [tls-scenarios](../workflows/capture/tls-scenarios.workflow.ts) | Tunnel、HTTPS Setup打开/取消、解密H1/H2正文与TLS详情、Map Remote往返、产品Save后Map Local缺失/修正/停用 | Tunnel使用`localhost`并保留唯一行和本轮端口断言；解密后使用原`expected.path`，映射只看`/e2e/rules/`内的自产请求，浏览器阶段使用`/playground/tls/browser-trust` |
| [body-scenarios](../workflows/capture/body-scenarios.workflow.ts)、[body-preview-limits](../workflows/capture/body-preview-limits.workflow.ts) | 现有请求/响应查看模式、HTTP JSON Tree、Markdown Preview/Split/Source及全屏返回、手动Format、格式化前后Copy、2MiB预览与禁用Format | 原场景`path`、UTF-8原`requestPath`及`/e2e/body-limits/<scenario>`；新模式操作不改变原正文输入 |
| [body-media-scenarios](../workflows/capture/body-media-scenarios.workflow.ts) | PNG预览、二进制Hex、音视频MIME/大小/Save，原生保存和返回状态 | 原五个场景和固定字节全部不变；逐个原path筛选并收起无关facet；音频48 B `audio/wav`、视频24 B `video/mp4`只说明元信息/保存，不宣称播放器或解码成功；新增macOS检查点已通过 |
| [section-collapse](../workflows/capture/section-collapse.workflow.ts)、[detail-body-fill](../workflows/capture/detail-body-fill.workflow.ts) | Headers独立折叠/展开、Timing、非空Query检查/折叠/展开、左右分栏拖拽/恢复、Request正文真实滚轮/滑块和外层交接 | `/e2e/capture/section-collapse`或`/e2e/detail-body-fill`；Query追加同源`/query`请求，不改旧请求和前置布局断言；后者保留`macos-scroll-boundary`项目 |
| [websocket-scenarios](../workflows/capture/websocket-scenarios.workflow.ts)、[grpc-scenarios](../workflows/capture/grpc-scenarios.workflow.ts) | Messages/gRPC页、方向、展开与真实Copy；WebSocket JSON Tree和全屏；gRPC在途消息 | 原场景`path`或自产`requestPath`；gRPC生命周期间隔保留`/e2e/grpc/` |
| [compact-message-layout](../workflows/capture/compact-message-layout.workflow.ts) | 两协议短/长消息Raw与Copy、高度拖拽、正文滚轮、键盘末尾、外层交接、正文Copy与消息Copy、全屏返回；205条加载/展开/完整正文/Copy，gRPC用Raw、WebSocket Text帧用Text | `/e2e/<protocol>/compact-message-layout`同时覆盖原连接和`/pagination`；按实际消息格式选择查看模式，不为Text帧强求不存在的Raw |
| [tools-har-transfer](../workflows/capture/tools-har-transfer.workflow.ts) | 原Capture Export菜单、HAR All/Filter/Selected范围、保留/去除正文、隐私默认与单次覆盖、原生Save、返回Capture、同一GUI文件Import及正文 | 原`/e2e/har-tools/`；All导出四条到`ui.har`，最后UI Import选择这份同次GUI导出的文件，4→8且保留原四条身份；Filter/Selected仍为两条/一条，原Agent/MCP断言不变；新增macOS回导已通过 |
| [tools-archive-transfer](../workflows/capture/tools-archive-transfer.workflow.ts) | Archive菜单、完整数据警告、取消/确认、原生Save/Open、追加后HTTP正文与WebSocket消息 | 公开Restore与Clear隔离两条自产输入；UI导出`ui.iarchive`含8条，再导入同一文件追加到16条，不能替换为此前Tool导出的`complete.iarchive`；新增macOS流程已通过 |
| [tools-transfer-jobs](../workflows/capture/tools-transfer-jobs.workflow.ts) | 真实运行进度、产品Cancel、清理完成后Clear，再重新产生大正文进行运行中退出 | 同样先通过正常UI Restore与Clear隔离；取消运行中任务和取消原生Dialog分别验证，不靠测试专用延迟；新增macOS流程已通过 |
| [navigate-tls-passthrough](../workflows/capture/navigate-tls-passthrough.workflow.ts) | 保留原TCP隧道导航，再拍CA/源站例外、HTTPS正文、精确透传添加/命中/定位/移除及恢复正文 | 同一受控`localhost` HTTPS URL建立三次新连接：解密→精确透传→移除后恢复；不是三个不同URL，原TCP回显也不代替真实HTTPS；新增macOS流程已通过 |

运行与采用边界：

- `Locator.filter({ hasText: ... })`只约束测试定位，不隐藏App列表的其他记录。两个全量facet流程使用下述公开路由隔离；其余流程在请求前通过真实Keyword控件选择现有自产路径，并在首张图前通过各组公共toggle折叠所有非必要facet，断言`aria-expanded=false`。分栏宽度、实际记录、facet计数、协议流量与原业务断言不变，不用CSS、Store或截图改字隐藏数据。
- Keyword只过滤请求列表，不过滤Application、Host、Rule等全量facet值；正常折叠这些组后不再显示其选项值。截图仍须人工审核，不能把Keyword当成整张图的自动脱敏。Tunnel没有可搜索的HTTP path或port，只用`localhost`；唯一Tunnel与本轮端口断言失败时整条流程不得采用。
- HTTP下载Clear跨`/e2e/http-download-clear`与`/playground/h1-json`：先在新路径核对新行，再切回旧路径并等待新行退出可见列表后断言旧行不存在，最后重新显示新行。旧记录的absence断言不能在只匹配新路径的Keyword下执行；其他间隔前缀仍包含相应被断言请求，不通过筛选制造空结果。
- `facets-clear-menu`与`clear-facets`先经公开Settings Restore恢复启动前的系统代理，核对完整原值与journal移除，再通过Capture Clear清理独立profile的临时数据。Restore后的录制控件实际显示Paused；`applyCaptureStatus()`会把系统代理归属纳入Renderer状态，不能从这个标签推断Core已经停止。此后不再点击Recording，因为它会走Start并重新接管系统路由；也不直接调用Preload/Store或为暂停添加Tool旁路。原五条/一条显式8888输入、Clear search、selection及全量facet断言均保留；截图前后核对完整计数及自产路径，结束后再次确认原系统代理与journal未被重新接管。残留连接造成污染时整条测试失败，不采用局部图，不用永久Keyword、隐藏值或反复Clear清洗数据。
- 准备清理先读取完整列表：已经零条时确认零条且Clear禁用，不点击；只有确有记录时先确认Clear可用，再点击并等待零条。此分派只用于发送自产输入之前的准备，不能用于绕过后面真正Clear的原始同帧、selection和全量facet断言。
- 共享`prepareHttpsCapture()`与`cleanHttpsCapture()`内部不添加逐步截图。`tls-scenarios`在原浏览器系统信任断言完成后，通过正常Settings/Certificates操作补MITM停用、localhost例外移除前后的检查点；`finally`仍调用原`cleanHttpsCapture()`完成指纹/信任复核与异常恢复。Generate、Install、添加例外和开启解密的逐步画面仍需所属原流程提供，不能用返回Capture的状态代替。
- Typecheck与Playwright `--list`仅证明检查点可编译、原测试可发现。真实English App、目标几何稳定、业务Green及正常Close/进程/8888/宿主恢复，仍由拥有App的串行运行取得；没有实拍结果不得标为已采用。

#### 父任务分批运行

沿用已经配置的English签名App和原`--screenshots`入口，串行执行以下selectors；不把`--list`结果当作真实App或退出恢复验收。除滚轮专项外使用`macos`；两条facet流程的Restore隔离仍须完整Green和逐图审核：

| 批次 | Playwright selectors | Project |
| --- | --- | --- |
| Recording与全屏 | `workflows/capture/(recording-pause-resume\|body-fullscreen)\.workflow\.ts` | `macos` |
| 正文与Headers | `workflows/capture/(body-preview-limits\|body-scenarios\|section-collapse)\.workflow\.ts` | `macos` |
| 消息 | `workflows/capture/(websocket-scenarios\|grpc-scenarios\|compact-message-layout)\.workflow\.ts` | `macos` |
| HTTP与TLS | `workflows/capture/(http-scenarios\|http2-scenarios\|playground-traffic\|tls-scenarios)\.workflow\.ts` | `macos` |
| 正文滚轮交接 | `workflows/capture/detail-body-fill.workflow.ts` | `macos-scroll-boundary` |
| 筛选与Clear的公开路由隔离 | `workflows/capture/(facets-clear-menu\|clear-facets)\.workflow\.ts` | `macos` |

#### 实拍操作映射与边界

- 教程已经按各原流程的真实输入重新绑定搜索与详情，不保留`orders`或旧GET的示例值来拼接另一条POST。输入、图序与未显示终态的说明见[最终发布核对](../../../test-results/capture-english-handoff/publication-final-capture.json)。
- HTTP Tree、Markdown Split/Source与左右分栏已由各自原workflow真实执行，来源记录保留在上述核对文件。Query示例为追加的四个参数，不保留旧教程24字段或96条entries的声称。
- 七维facet的图片区分操作入口与操作结果：Application Unknown、Host、Content type及筛选栏按钮有尚未选择/收起的画面，不能称为已完成的终态。HTTP/2 Protocol另有真实选择/取消来源。`facets-clear-menu`验证Application/Status/Type的Pending与Method/Status组合，输入为五条自产记录，非旧教程四条`/guide/filters`；非必要组收起不能代替其他维度完整验收。
- `http2-scenarios`已验证实际Protocol HTTP/2选择/取消，以及独立`/e2e/h2/body-progress`的64KiB→128KiB但未结束→完整128KiB可读/Copy/trailer步骤；两条6MiB Range原断言保持，不混称同一响应。
- 错误GOAWAY已在同一原POST的Response Headers核对声明512KiB，再查看实际256KiB响应；独立恢复GET打开Response Raw并Copy核对同一真实响应。不跨`/playground`与`/e2e`拼接同一次请求。Headers/trailer内容先正常滚入Inspector，再拍可见目标。
- `compact-message-layout`补两协议短JSON的真实Copy与剪贴板逐字核对。原长消息输入、尺寸、滚轮、全屏与两种Copy断言不变，不把长消息图标成短消息复制。
- 分页继续使用独立`/pagination`连接；gRPC保留205条Response JSON，WebSocket真实发送并逐条收到205条Text JSON回声，再筛选Sent。正文均为`{"index":0..204,"state":"complete"}`。滚轮加载末条后展开：gRPC切Raw，WebSocket Text帧选择Text；滚入完整可见区域并逐字核对正文，再从消息专用Copy核对完整原文。WebSocket从真实公开行ID读取末条seq，不把第205条Sent等同全连接seq205。Text帧不提供Raw时不增加产品模式、不提高时限、不删除完整正文/Copy断言。
- 大正文Save body与Format由各自原workflow验证，`body-preview-limits`没有保存操作。Clear后的真实Pause/Resume与新POST复用Storage来源；列表图片只说明新行出现，不声称尚未打开的Response已在图中显示。
- Original/Final、Rules快捷Block/Breakpoint和Transfer引用图继续由其所属原流程负责，不在本轮Capture检查点中制造替代图。

#### 最后采用的macOS来源

以下独立测试均为`passed`、`hostRestored=true`及正常退出；不将同批失败测试的局部图片混入。Windows、独立环境及未执行分支仍按原验收边界保留。

| Workflow | Run |
| --- | --- |
| `facets-clear-menu`、`clear-facets` | [2026-10-21T20-08-04-942Z-jn72KP](../../../test-results/workflow-screenshots/2026-10-21T20-08-04-942Z-jn72KP/) |
| `compact-message-layout` WebSocket | [2026-10-21T20-00-22-713Z-s76DnT](../../../test-results/workflow-screenshots/2026-10-21T20-00-22-713Z-s76DnT/) |
| `compact-message-layout` gRPC | [2026-10-21T19-09-11-384Z-9vboiX](../../../test-results/workflow-screenshots/2026-10-21T19-09-11-384Z-9vboiX/)中的独立gRPC通过结果 |
| `http2-scenarios`、`http2-origin-goaway` | [2026-10-21T19-20-21-252Z-OBUvxl](../../../test-results/workflow-screenshots/2026-10-21T19-20-21-252Z-OBUvxl/) |
| `breakpoint-menu-hierarchy` | [2026-10-21T19-33-47-163Z-5INkK1](../../../test-results/workflow-screenshots/2026-10-21T19-33-47-163Z-5INkK1/) |
| `breakpoint-submenu-lifecycle`与Manager | [2026-10-21T19-44-10-238Z-JNfI58](../../../test-results/workflow-screenshots/2026-10-21T19-44-10-238Z-JNfI58/) |
| `body-media-scenarios`、`tools-har-transfer` | [2026-10-21T19-01-48-619Z-tbNOPz](../../../test-results/workflow-screenshots/2026-10-21T19-01-48-619Z-tbNOPz/) |
| `tools-archive-transfer` | [2026-10-21T17-26-41-702Z-Sz4VPq](../../../test-results/workflow-screenshots/2026-10-21T17-26-41-702Z-Sz4VPq/)中的独立Archive通过结果 |
| `tools-transfer-jobs` | [2026-10-21T18-51-41-246Z-vWvRUk](../../../test-results/workflow-screenshots/2026-10-21T18-51-41-246Z-vWvRUk/) |
| `navigate-tls-passthrough` | [2026-10-21T18-54-54-381Z-if8Bkz](../../../test-results/workflow-screenshots/2026-10-21T18-54-54-381Z-if8Bkz/) |
| `tls-scenarios`末尾清理 | [2026-10-21T15-08-55-695Z-hFPcCP](../../../test-results/workflow-screenshots/2026-10-21T15-08-55-695Z-hFPcCP/) |

#### 常用正文与详情操作契约

- `body-scenarios`保留原`body-json`上传/响应和Raw复制断言，然后点击Tree核对`ready`、`items`及数组索引；真实折叠/展开根节点，Copy必须等于同一份原JSON，最后返回Raw。每步先验证DOM/剪贴板，再截图。
- 同一个`body-json`补齐入门所需画面：Keyword输入后、列表出现、选中记录、Headers、Tree→Raw→Hex→Fullscreen→Raw/Copy→Escape全部沿用这一次POST和同一行身份；Headers保留实际JSON MIME。`body-json-example.json`只记录本轮真实URL、方法、请求/响应及行ID，不发送第二条请求凑图。补充序列须重跑原`body-scenarios.workflow.ts`，旧43张步骤图不能充当新增动作的实拍。
- 全屏Header Copy之后，先真实点击弹窗内Raw模式按钮，确认该按钮获得焦点、仍选中Raw且Copy tooltip已关闭，再发送一次Escape。不能把先关闭tooltip当成关闭dialog；保持原dialog消失、Raw保留和正文一致断言，不改用Close或增加等待时间。
- 同流程的原Markdown输入仍为`# Capture Lab\n\n- request\n- response\n`。Preview核对标题/列表后，通过模式组真实右方向键依次选Split和Source；Split必须同时显示渲染预览和带`#`的源码，Source只有源码。Source的Copy逐字核对原文，再打开Fullscreen、Escape返回并核对Source保留，最后恢复Preview。没有给产品补模式ID或使用显示文案定位控件。
- `section-collapse`的原无Query GET、Header独立折叠、Timing布局与全部断言保持先执行。随后通过同一真实origin/client追加`/e2e/capture/section-collapse/query?orderId=ord_42&tag=books&tag=featured&message=hello%20capture`，仅切换Keyword到该自产子路径；Request的Query必须显示四行、保留两个`tag`并将空格解码为`hello capture`。真实折叠/展开Query，保持同一行身份。
- 同一Query请求中通过`capture.inspector.splitter`真实向左拖120px，验证Inspector变宽且Query内容不变；在`finally`通过真实拖拽恢复原宽度并再次核对。原Header/Timing尺寸断言不移到扩宽后，也不以截图延迟替代边界断言。
- `tls-scenarios`的跨协议映射继续使用原`E2E HTTPS to HTTP mapping`、源Host `localhost`、Path `/e2e/rules/tls-mapping`与HTTP目标`127.0.0.1:<本轮端口>/e2e/rules/mapped-http`。分别拍真实字段、scheme选择、启用和Apply；原客户端200/`owned-http-mapping-result`及目标GET断言之后，通过Capture的`/e2e/rules/`筛选查看本次响应。停用/Apply后保留原`/disabled`请求的404断言并在Capture查看该行，`https-http-mapping.json`记录真实两端URL。不能用之前的Tunnel或解密JSON图代表映射结果。
- Rules旧`rules-routing`的14张可见图中，前6张由Map Remote覆盖。Map Local文件步骤扩在同一个原`tls-scenarios`内：先从映射成功的Capture Response点击Save，经原生Dialog写入本轮`https-map-local-response.txt`；文件原先必须不存在，产品完成后逐字节/hash核对`owned-http-mapping-result`，不可由测试预写导入文件。
- 保留Map Remote原`/disabled`的404及所有断言后，在同一规则中移除Map Remote、添加Map Local，Host和原路径前缀不变。填写不存在的`https-map-local-missing.txt`、启用并Save；新HTTPS `/map-local-missing`必须返回404与`Map Local target not found.`，Capture通过该完整自产path筛选并查看实际Response。
- 再通过Map Local的真实可编辑路径输入框改为上述产品Save的文件并Save；新HTTPS `/map-local-enabled`必须返回200，实际响应字节必须等于已保存文件，Capture显示同一正文。这里没有文件选择按钮，不用原生Open或内部API假装选择文件。
- 最后停用并Save，再发新HTTPS `/map-local-disabled`；实际结果必须恢复原TLS服务的404和空正文，不再返回缺失文件提示或文件内容。`https-map-local.json`保存真实URL、原Save来源行、文件字节/hash和三次请求的行身份；产品生成的文件作为attachment保留，原路径在`finally`删除。保留原Edge系统信任、CA/Root和宿主退出恢复。macOS原流程已在`2026-10-21T13-36-04-054Z-XO6oHx`通过，38帧均为英文，`hostRestored`与`gracefulDestroyVerified`均为true；新增文件段尚无Windows结果。
- `/enabled`、`/disabled`与三个`/map-local-*`后缀属于不同的完整URL，不能把它们说成重复同一URL。不用共享HTTPS清理结束后的页面代替缺失的Certificates步骤图，也不在Map Local实机通过前采用旧本地文件图的替代素材。
- `tools-har-transfer`只扩原UI阶段，不新增教程workflow或HAR输入。采集自产POST时用真实Keyword `/e2e/har-tools/`并折叠非必要facet；原Agent/MCP的授权、取消、暂停/Clear、两次产品Import及All范围不变。Capture UI的All导出实际四条，Filter实际两条文本记录，Selected实际一条。选中后通过真实Response页查看自产正文，截图不展示Request Headers内的测试凭据。
- HAR弹窗先检查Authorization/Cookie默认遮罩、`strip bodies`未勾选，再记录All/Filter/Selected和原生Save；原全局Privacy关闭后的override/plain/stripped三次导出分别核对真实checkbox状态、文件条数、Headers与正文，最后恢复Privacy默认。每张图的编号对应菜单项、范围按钮、checkbox或实际返回页控件，不将Export按钮当成完成状态标志。
- HAR输出目录由本workflow的`testInfo.outputPath('har-transfer-files')`拥有。原生Save/Open仍由已有helper操作；全部九份HAR均由产品导出，JSON证据和hash不能成为导入文件。完成时先验证真实文件与原关闭操作，再要求弹窗消失、Export入口可用；运行中任务可能在完成轮询时自动关闭，不人为停留进度或承诺能拍到常驻Completed面板。UI Import仍追加到六条，重启、Main/Core/Worker、8888和宿主恢复保留原验证。

## `capture.body-preview-limits`

1. fresh profile通过UI开启录制，loopback origin分别返回完整1.25MiB和3MiB JSON；客户端校验完整响应。
2. 选择自产行的Response正文。1.25MiB初始不格式化，Copy长度/hash等于原文；点击Format后才得到格式化结果。
3. 3MiB正文只预览/Copy前2MiB，Format禁用，完整网络数据不受影响。
4. 保存截图、字节数/hash和trace；正常Close后核对Main/Core/Worker、8888、系统代理与日常CA恢复。现行正文/压缩/WS/gRPC边界测试使用2MiB；Windows验收单独跟踪。

手动格式化后的Copy按文本语义归一化CRLF/LF，再同时核对完整长度与SHA-256；初始未格式化Copy、截断边界及网络正文仍保留原字节断言，不把格式化副本当成线上正文。

本文件定义 Capture 工作区的完整 E2E 流程。每条 workflow 都独立启动 Electron、独占 profile、trace 和 loopback fixture，并从 fresh App 写到 Close/destroy。

<a id="capture-https-setup-position"></a>
## `capture.https-setup-position`（macOS）

1. 普通fixture先只读确认共享CA材料齐全且已受信任，保存完整代理、Root/admin trust基线；独立fresh profile启动真实Electron、trace、Main/Core和8888，不Generate、Install或Delete日常CA。
2. 从Capture的公共`capture.enable-mitm`入口打开HTTPS Setup；通过公共automation ID确认Generate/Install控件不存在，`capture.https-setup.start-decrypting`可用但不点击。fresh profile不代表共享CA为空。
3. 在打开和截图期间逐帧只读测量唯一弹窗；至少取得三帧有效矩形，每帧相对Renderer中心的水平/垂直误差不超过1px，主窗口screenX/screenY保持不变。不注入Store、修改样式或切换语言。
4. 保存`https-setup-position.json`逐帧原值与`https-setup-position.png`，真实点击Cancel，确认弹窗关闭。
5. 保存trace/metadata，通过产品Close退出；fixture验证Main/Core/Worker全退、8888释放、完整代理与共享CA/系统信任恢复，再删除本workflow的profile。

<a id="capture-http2-origin-goaway"></a>
## `capture.http2-origin-goaway`

**状态**：Windows实机已验；macOS保留既有记录。

1. 独立profile、trace和宿主基线启动真实Electron/Core/8888，复用共享受信任CA；经Certificates UI只添加测试localhost例外并开启MITM，经Capture UI开启Recording。
2. 通过Rules UI创建只匹配本轮自产路径的响应断点并Apply。使用TrafficLab的真实TLS/H2 origin，POST正文固定且只发送一次；响应为4MiB、Content-Length精确匹配，并带自产校验trailer。Core integration另覆盖384KiB边界。
3. Capture以`/e2e/h2/origin-goaway/`搜索，正常折叠非必要facet；等待真实暂停行与Continue unmodified按钮并以该按钮作截图标注。源站在响应未放行时发送正常GOAWAY并结束全部正文/trailer；不通过Preload或Store解除断点。
4. 真实点击Continue unmodified。客户端须收到全部字节、独立SHA-256、trailer及正常end；Capture同一行须保留h2/200、完整正文和trailer，进度不再显示进行中。将Headers中的完整trailer标题及内容滚入可见区域后截图。
5. 在同一下游连接上发送另一个自产路径的新请求；源站须使用新的上游session，两个POST各只出现一次，不重放原请求、不换下游连接掩盖旧请求失败。选中新`/next` POST并打开Response Raw，核对该路径的JSON后截图；不是旧响应的另一张图，也不是GET。
6. 保存wire字节/hash、源站次数/session、Capture身份、截图、trace及每代metadata；真实删除本轮规则、关闭MITM并移除localhost例外，产品Close后验证Main/Core/Worker全退、8888与完整代理/CA/Root恢复，再删除profile。

此流程的前置Red必须是正文、trailer或终态不满足，不以构建、选择器、授权或清理失败代替。DATA.END_STREAM、真正提前EOF、并发和生命周期边界由Core integration交叉覆盖；Windows实机归第8项。

<a id="capture-body-fullscreen"></a>
## `capture.body.fullscreen`

末行Copy：origin在JSON/HTML响应中返回`x-copy-wrap: private, max-age=60, s-maxage=60, stale-while-revalidate=300`；通过自产Header key定位实际行。离开行Copy透明、hover显示，Copy所属末行18px且flex居中，紧随文字4px；原生跨行选择及按钮Copy均为完整Header值。保存`header-copy-last-line-{json,html}.json/png`再断言。

**状态**：Windows的URL就绪门禁已有前置Red与最终Green；精准筛选后JSON/HTML的Header hover、标题和General复制及完整退出恢复通过。既有失败保留，不以最终Green改写历史。
**策略**：真实Capture Request/Response；共享BodyViewer/BodyFullscreen；真实剪贴板

General的POST值使用共享IconButton inline档，按钮18x18px、Lucide图标实际14x14px、padding0；离开行opacity0、hover后1且复制完整POST。保存`header-copy-{json,html}.json/png`；不修改语言、不强制显示所有Copy。

### Steps

1. fresh profile经录制UI开启Capture，通过公共Keyword按当前自产路径筛选；真实POST请求通过8888进入本轮origin，分别返回JSON与HTML。完整筛选列表只允许有当前请求，不用Locator文本过滤隐藏背景流量，不注入Store或正文引用。
2. 选择Capture行后核对标题中的自产host/path；完整URL就绪前标题Copy不显示，当前URL就绪后才可点击，不能复制上一条请求或短标题。通过实际出现的Copy按钮执行操作，剪贴板必须是带scheme和origin端口的完整URL，不用固定sleep代替就绪。General的Request URL同样只复制完整URL；Request Method显示11.5px普通文字，无标签背景，hover后Copy得到完整POST。在Request/Response选择Raw，核对MIME和原始正文，通过正式Fullscreen按钮打开唯一dialog；内联与全屏不出现两份正文视图。
3. 正文分组标题按设计使用normal字体行高；MIME/大小计数不继承标题的uppercase和字距，保留原本大小写与normal字距。Request的空Query提示使用当前ConfigProvider正文行高token，不继承Shell压缩行高。真实点击弹层Header的Copy，剪贴板必须逐字等于原始正文；Header的Close退出后保持Raw与相同正文。
4. 再次打开并切Hex，用Escape关闭后仍选中Hex；返回Raw并通过内联Copy确认原始字节不变。响应HTML只作为代码显示。
5. 保存每个正文的身份、Copy/模式断言、trace与截图；Renderer不得有page error，fixture正常退出Main/Core/Worker并恢复8888、WinINet/journal。

### URL就绪门禁与Windows证据

- `inspector-url-copy.test.ts`覆盖详情未加载、当前URL就绪、保留上一条详情和同一请求刷新；前置2项失败，修复后同组全绿，Inspector tab/行摘要相关测试共27项通过。
- 真实前置`fullscreen-before`在已精准筛选后仍把`http://127.0.0.1:55192/e2e/fullscreen-json`复制为`127.0.0.1/e2e/fullscreen-json`；这是产品行为Red，不是筛选或环境失败。
- 最终`fullscreen-final`核对标题与General的完整URL、两种响应的Header hover、完整Header值和正文复制、Raw/Hex及Fullscreen模式保持。URL截图在实际复制及断言之后保存，不用截图等待掩盖快速点击竞态。
- 两代metadata均确认正常退出；最终通过产品卸载/删除本轮唯一CA，宿主代理、Root、journal和8888恢复。原始report、trace、截图与恢复结果保留在会话files的`item8-url-ready-202610112240`。
- Capture浅/深色parity的84个目标全部匹配，无缺失或flagged项，最大几何偏差0.5px；像素差异仍分别报告，不将像素diff视为零。未修改正式设计截图或Header CSS。

## 多协议测试输入

测试侧只提供真实 loopback origin 和客户端，不替换 App 内部实现：

- Plain origin：HTTP/1.1 JSON + RFC 6455 WS text/binary echo；
- Secure H1 origin：HTTPS JSON + WSS text/binary echo，自签名源站证书；
- Secure H2 origin：ALPN h2 JSON + 原生 gRPC，自签名源站证书；
- 客户端显式连接 `127.0.0.1:8888`，所有字节真实经过 Interceptor listener、Proxy Core、Storage 和 Renderer。

固定请求数据：

- HTTP/HTTPS header：`x-interceptor-e2e-request: <protocol>`；POST body 为固定 JSON；
- response header：`x-interceptor-e2e-response: <protocol>`、JSON content type、两个 Set-Cookie；
- WS/WSS text：`plain-text` / `secure-text`；binary：`01 02 03 04`，origin原样 echo；
- H2 path：`/e2e/mitm/h2?source=workflow`，response trailer `x-interceptor-e2e-trailer: h2-complete`；
- gRPC path：`/interceptor.e2e.WorkflowService/Stream`；一个 request envelope、两个 response envelope，第二个 compressed flag=true；trailers=`grpc-status: 0`、`grpc-message: OK`。

<a id="capture-scenarios-http"></a>
## `capture.scenarios.http`

**状态**：passed
**策略**：真实Electron；复用Playground流量库；不启动Playground页面，不新增流量工具的测试

### Steps

1. fresh profile启动真实Electron，经公开Recording控件开始抓包；使用现有`trafficLab`创建真实origin/client。
2. `TrafficLab.run()`运行已有场景默认Draft，所有流量经产品`8888`，不注入Store或直接调用Preload/Main/Core业务API。
3. `h1-json`验证H1/GET/200及固定JSON；`h1-upload`验证完整45字节上传和实际接收计数；`h1-stream`保留三个JSON分块；`h1-early-response`响应先完成仍保留38字节完整上传。
4. 真实检查Request/Response Headers、Raw正文；`h1-abort`源站断开后请求仍保留，不显示200或等待状态。H2由独立workflow验证。
5. 额外413边界使用workflow拥有的真实origin/client：先发送一段上传，再返回分段413响应。收到413响应头时继续接收正文；完整响应结束后，Capture保留413状态、完整响应正文和当时已捕获的上传片段，不要求客户端先断开。此项不新增Playground场景或修改第三方。
6. SSE使用独立loopback origin/client，先保留响应不发头：确认Capture已有唯一自产请求行。再发送200与`text/event-stream`和第一条事件，通过Headers页核对MIME、列表Size核对实际字节；保持连接未结束，发送第二条事件并确认同一行Size增长。两次均独立断言origin未结束、client未完成响应，不能先结束流再验进行中状态。
7. 最后发送第三条事件并正常结束，client收到的完整正文与三条事件逐字节一致；产品Response Text显示全部事件，行身份保持不变。SSE使用既有Text/Hex档位，不要求不存在的Raw控件。保存`sse-inflight.json`、`sse-inflight.png`、场景结果、trace与截图；fixtures关闭origin及Electron，核验Main/Core/Worker、8888、完整WinINet和共享journal恢复。
8. 客户端取消与origin reset各新建一条SSE连接，重复未结束时的Headers、36/72 B与唯一行断言，然后分别由client或origin真实断开。要求client响应未完整结束、origin关闭，Capture同一行保留72 B且没有进行中占位；不把已收到的200改为伪造错误码。分别保存`sse-client-abort.json`与`sse-origin-reset.json`及各自进行中截图，最后仍由同一workflow完整清理。
9. 长上传逐项覆盖未知长度chunked、Content-Length和Expect: 100-continue：公共Keyword输入定位自产path，先只发头，origin必须在正文发送前接收请求；Expect场景等待真实100 Continue。逐段发送2 MiB，前两段各等待origin实际接收并核对Capture同一行的2/4 MB，client和origin均未结束上传。最后发送第三段并结束，origin完整6 MiB的SHA-256必须一致，Capture保留同一行并展示200、完整`upload-ok`响应。保存逐段字节、结束状态、framing与SHA-256，清除Keyword后继续其他场景。
10. 长下载使用真实origin逐段发送三段2 MiB，正常结束、跨Pause/Resume和Clear各使用独立连接。首段后通过产品Recording暂停或Clear，第二段在连接未结束时仍由client接收；普通/暂停场景同一行显示2/4 MB，Clear场景旧行消失且不因后续分块复活。完整6 MiB响应SHA-256一致后，普通/暂停场景保留6 MB及耗时，暂停场景恢复Recording；Clear场景通过已有`h1-json`产生新请求并确认其Capture行出现、旧行仍不存在。分别保存`download-*.json`、进行中截图与完整workflow退出证据，不将本步骤外推为H2/gRPC或文件任务竞态覆盖。

### 证据要求

- 测试对象是Interceptor抓取与展示，不是Playground场景实现；网络返回值只证明流量已产生，产品期望独立写在workflow中。
- SSE客户端中断后，Capture正文与客户端实际收到的事件分片一致；连接关闭后代理生成的`Error: aborted`不能成为额外正文。保留固定收尾窗口内的合法迟到观测，不以过滤特定字符串、降低字节断言或延长测试超时作为通过条件。
- 只新增现有产品行为的E2E覆盖，不人为制造Red；若发现产品故障，先保存真实失败证据并补所属模块测试，再修改产品。
- 长上传取消在两个2 MiB分块已由origin接收并由Capture显示后，由client真实断开；origin必须关闭且未完整接收，Capture保留4 MB及同一行且不再显示进行中占位，不要求生成未收到的200或响应正文。
- SSE证据保存响应头发出前及两次事件到达后的行内容、公共行身份、实际字节数与origin/client结束状态；三种结束方式分别记录，不以正常结束通过替代取消/reset。本步骤不代表Rule命中、H2大Range或gRPC streaming通过。
- 通过一个场景不提升整组或39项总量；逐场景记录实际Green及退出恢复证据。
- early response必须在Request区块显示38字节并可读完整`{"request":"continues-after-response"}`；响应为`sent-before-request-completed`。413例外独立验收，不能用普通提前200场景的通过替代。
- 413验收不以中断事件为前提，也不把所有错误状态视为同一规则；完整413响应接收后可读取已捕获上传正文，迟到事件不改写终态。真实请求是否继续发送或关闭仍由客户端和origin决定，Core只调整Capture记录。
- 应用归属迟到不得覆盖终态或耗时，`h1-abort`等待占位断言保留。

<a id="capture-scenarios-http2"></a>
## `capture.scenarios.http2`

**状态**：passed；源站正常GOAWAY另行跟踪，不在本流程通过范围
**策略**：真实Electron；正式Certificates UI；复用已初始化共享CA；host-safety-guard

### Steps

1. 保存完整Root指纹基线，在fresh profile通过Certificates UI确认共享CA就绪，添加localhost源站例外并开启MITM；不重复生成/安装CA，不调用Manager。
2. 经UI开启Recording，使用现有`h2-json`默认Draft，经CONNECT/TLS/ALPN向真实origin发请求。
3. 客户端完成H2/200和`x-playground-trailer: h2-complete`；Capture只显示一条自产H2/GET/200行。
4. 通过Protocol组选择HTTP/2，确认当前行保留，再取消选择并收起分组；真实点击Headers，核对Request `accept: application/json`、Response `content-type: application/json`和trailer。每段标题与内容正常滚入Inspector后截图，不拍被底栏遮挡的trailer。Response Raw正文包含`"protocol": "h2"`与`"path": "/playground/h2-json"`。
5. 保存trace、截图和协议/行身份；`finally`通过UI停用MITM、删除localhost例外，保留共享CA材料与信任并比较完整Root集合。
6. fixture正常退出Electron，验证Main/Core/Worker、8888、WinINet/journal恢复；失败保留profile。fixture不新增unit/integration测试。

同一workflow先补单流正文过程：`GET /e2e/h2/body-progress`返回`text/plain; charset=utf-8`，声明131072字节。源站先写64KiB的`a`，再写64KiB的`b`但不结束；客户端与同一Capture行分别到64/128KiB，两次均未收到END。真实打开Response观察两阶段，再结束响应；同一行保持身份、显示128KB与结束耗时，Text可读。Copy按长度和SHA核对完整128KiB，再在Headers查看`x-capture-end: complete`。不更改下面Range输入，不以另一个请求或复制预览代替完整正文；新检查点待真实Green。

同一workflow补充三种多stream场景：每种使用一个真实CONNECT/TLS/H2 session，同时请求两个6 MiB Range。共享TLS origin各先发送2 MiB，尚未结束时通过真实Capture列表核对两条独立H2/GET/206记录及2 MB，在Headers核对Range、Content-Range和Content-Length，保存stream ID、公共行身份、字节数及进行中截图。正常完成后客户端逐流hash一致、原行变为6 MB且Time不再占位；Clear必须点击产品按钮，剩余数据继续完整转发、旧行不恢复，同一连接的新请求仍可录制；取消只发送首条stream的NGHTTP2_CANCEL，源站对应响应关闭、Capture保留2 MB及结束耗时，另一条仍完整接收6 MiB。确定性Core终态由已有H2集成覆盖，UI不虚构未展示的协议字段。每种保存`h2-ranges-<action>.json`和前后截图，最后仍由同一workflow通过真实UI恢复CA/Root及宿主，不增加产品测试专用入口。

继续增加两个session场景，保留上述准备、真实UI断言及清理：`settings`在各到2 MiB时通过客户端发送并等待SETTINGS ACK，确认32 KiB窗口、0字节header table和32 KiB最大frame后，两流完整到6 MiB；`goaway`在相同位置正常关闭客户端session，记录此时closed但尚未destroyed，已有两流完整结束后确认连接已销毁，再由新H2连接发`after-goaway`并在真实列表确认新200行。两场景均保留原行身份、最终字节/hash和结束耗时，`h2-ranges-<action>.json`增加session阶段快照；不把协议客户端的控制操作当作产品API，也不要求UI显示尚未实现的GOAWAY事件。

错误GOAWAY两方向：真实POST的200响应已收到首段256 KiB且声明512 KiB时，分别由源站和客户端发送`INTERNAL_ERROR` GOAWAY。客户端实际中断并只保留首段hash，Capture原行仍保留真实200与部分字节、结束耗时，不显示完整成功；Core集成核对`aborted/failed`终态。源站记录POST仅到达一次，另开下游H2连接发送独立后续请求，真实列表新增200行，旧行及部分正文不改变。沿用原CA准备和恢复，保存错误码、stream/session身份、请求次数、字节/hash、截图和trace；不得注入产品状态或直接调用业务API。背景TLS提示只经公共Dismiss真实关闭，不自动加host；部分正文通过实际Text模式而非JSON Raw查看。

迟到观测收尾：客户端方向在收到完整首段的data回调里立即发送错误GOAWAY，不先等待Capture显示256 KiB后才中断。Capture先进入中断终态，随后在固定1秒收尾窗口内补入已观察正文；用原有公共行与正文视图等待数据可见，不以固定sleep替代断言。网络响应仍仅为256 KiB，不补全声明的512 KiB、不重放POST、不把终态恢复为成功。精确1000ms、重复abort不重置、窗口内首次创建writer、Clear/删除/退出取消由Core回归验证；本workflow保留真实UI、协议字节/hash、原行身份及退出恢复证据。

<a id="capture-scenarios-bodies"></a>
## `capture.scenarios.bodies`

**状态**：passed
**策略**：真实Electron；现有TrafficLab；不新增Playground工具测试

### Steps

1. fresh profile经真实UI开启Recording；逐次运行现有Body默认Draft，所有字节经8888进入Capture。
2. 选择自产路径的单条200请求；有上传内容时在Request Text/Raw核对完整正文。
3. 在Response按既有模式检查JSON、Text、HTML、CSS、JavaScript、XML、YAML、SVG、Markdown、Form及Unknown text；同时核对正文长度。
4. 期望正文在workflow独立定义，不从origin结果生成；HTML/SVG保持代码文本不执行，Markdown Preview显示标题及两项列表。
5. 保存逐场景身份、trace和截图；fixture关闭origin及真实Electron，验证Main/Core/Worker、8888和完整WinINet/journal恢复。

Raw模式必须显示捕获的原始内容，不能残留Code模式自动格式化后的缩进。
每场景独立关闭并重开Inspector，先确认正文长度和radio选中状态；代码模型经真实全选/复制校验，仅归一Windows剪贴板CRLF。模式卸载不得重复销毁Monaco模型，最终Renderer page error必须为0。

UTF-8场景使预览边界落在2/3/4字节字符内，分别检查普通文本、未知MIME、代码Raw、工具栏Copy和真实编辑器全选复制；只比较长度/尾部/SHA256，不向trace返回整份大正文。真实Save生成完整正文并校验SHA256，包含预览之外的字节。非法字节与Hex保真由产品unit覆盖。

受限提示布局：每个UTF-8预览场景在正文模式确定后，从公共body-view内定位提示条，确认11.5px字号、正文token行高、9px/11px padding与8px gap，图标和提示条垂直居中；保存尺寸JSON与提示截图，再执行Copy/完整Save断言。

<a id="capture-scenarios-body-media"></a>
## `capture.scenarios.body-media`

**状态**：Windows媒体布局与真实Save原记录保留；macOS新增全窗口英文元信息与保存前后检查点已通过，来源`2026-10-21T19-01-48-619Z-tbNOPz`。
**策略**：真实Capture UI；Windows原生Save Dialog；现有流量库

### Steps

1. fresh profile启用Recording，正常折叠无关facet，逐个以原scenario path筛选并运行`body-png`、`body-binary`、`body-unknown-binary`、`body-audio`和`body-video`；每次从空Inspector打开自产200行。不改原输入字节或已存在的解码/布局断言。
2. Response区块长度分别为68、8、5、48、24字节；PNG须实际解码为1x1并保存预览截图；二进制Hex精确显示固定字节序列。
3. 音视频保持现有不读取Renderer正文的边界，显示MIME且无audio/video/iframe播放器；检查图标到详情10px、详情内7px、说明到Save 13px，图标/MIME/大小/说明/Save水平居中。Save仍28px的sm按钮，MIME为13px自然行高、大小为11.5px正文token行高。保存前拍完整App：`audio/wav`为48字节，`video/mp4`为24字节，标注唯一Save入口；它们不证明播放、时长或codec解析。点击Save并用真实键鼠操作Save Dialog。
4. 只读核对同workflow经产品导出的WAV/MP4文件与独立固定字节一致，再拍返回元信息的App画面。PNG/Hex也在关闭Inspector前拍实际预览；关闭后的图片只描述返回列表，不冒充仍在查看正文。不预造导入文件或调用内部API。
5. 保存逐场景证据及trace，Renderer page error为0；fixture正常关闭产品，验证原生窗口、进程、8888、WinINet/journal恢复。

原生Save由平台file-dialog fixture分派：Windows复用原UI Automation和键鼠实现；macOS通过System Events按Main PID/启动时间定位真实面板，以键鼠导航路径和提交。两平台使用相同自产媒体、保存步骤和字节断言，不改写原生返回值。

<a id="capture-scenarios-encoding"></a>
## `capture.scenarios.encoding`

**状态**：passed；五种编码/损坏场景Green，原始字节与错误信息均保留
**策略**：真实Capture UI；现有压缩/损坏场景；host-safety-guard

### Steps

1. fresh profile经UI启用Recording；依次经真实8888执行gzip、deflate、brotli、损坏gzip及无效PNG场景。
2. 每种流量显示唯一自产200行和实际编码字节数；正常编码在Response Raw分别显示独立预期`{"encoding":"gzip"}`、`{"encoding":"deflate"}`、`{"encoding":"br"}`。
3. 损坏gzip显示包含协议值gzip的解码错误信息，Hex保留`1f 8b 08 00 01 02 03`；无效PNG显示`image/png`不可预览占位，不保留损坏img元素。
4. 不改变应用语言、不用本地化文案定位；每场景关闭Inspector，避免旧正文控件竞态。
5. 保存逐场景、trace和截图，要求Renderer无page error；fixture验证origin及Main/Core/Worker退出、8888/WinINet/journal恢复。

UTF-8追加步骤：通过同一真实origin发送超过预览上限的gzip输入，解码明文在预览边界处只包含中文字符的前两个字节；Raw/Copy和编辑器全选复制必须只有完整前缀。

<a id="capture-scenarios-websocket"></a>
## `capture.messages.compact-layout`（普通WebSocket与gRPC正文）

**状态**：Windows消息布局、拖拽、Copy、全屏与gRPC分页已验；窗口缩放子步骤保留macOS原记录。

1. 每种协议独立fresh profile、trace及完整宿主基线；通过真实UI启动Recording。WebSocket使用现有loopback echo；gRPC通过Certificates复用共享CA、添加localhost源站例外并开启MITM，使用现有TLS/H2 origin，不能生成/清理日常CA。
2. 经真实8888发送一条短消息和一条含末尾唯一标记的长消息。客户端/origin核对完整字节与协议结束，再由Capture自产路径定位连接，使用公共消息ID展开载荷，选择Text/Raw或默认Pretty，不注入Store或正文。
3. 短消息外框等于Monaco内容高加实际上下边框，字体12px/行高20px/上下padding13px保持；长消息初始外框不能超过所属滚动容器当前可用空间且必须存在内部滚动，不能使用固定441px或360px断言代替容器计算。
4. 实际鼠标拖动右下角缩小正文，外框高度随拖拽改变；真实滚轮先移动正文而不滚消息标题，到末行后继续滚外层。键盘到首/尾均可达。窗口或Inspector可用空间缩小后按容器clamp，恢复后保留手动高度。
5. 拖拽/滚动后点击正文Copy，结果与该模式应有的完整消息一致；消息专用Copy和客户端记录仍保真。切Hex、Tree、全屏以及切换/收起消息，不错误套用可拖拽布局或向下一条消息泄漏手动高度；现有协议专项继续覆盖消息保存与完整字节。
6. gRPC额外生成205条真实消息，经同一Inspector滚动加载第三页，定位并复制第205条，验证虚拟化的scrollMargin及分页不会因移除内部固定360px上限而失效。
7. 保存同主题/尺寸的改前/改后PNG、实际高度、内外scroll位置、Copy长度/hash与trace。gRPC通过真实UI关闭本profile的MITM及测试host配置；正常Close后验证Main/Core/Worker全退、8888释放、完整系统代理与CA/Root/admin trust保持，不能把fixture/授权失败当产品目标Red。

WebSocket输入使用binary JSON消息以沿用内容探测与Pretty/Raw，正文Copy是完整UTF-8，而消息专用Copy仍是原binary Hex；不能为了统一断言修改产品语义。内外滚动使用足够的后续真实消息确保外层确有溢出，不给产品注入高度。gRPC第三页加载保持loadMore回调稳定，避免虚拟列表滚动触发同步重渲染时移除同一事件上的分页监听；失败与修复均保留真实证据。

文本剪贴板比较沿用Body/Encoding场景的CRLF/LF归一化后逐字比较；消息专用Copy仍按UTF-8文本或binary Hex分别验证，协议载荷与导出文件保留原字节断言，不修改产品或输入正文。

## `capture.scenarios.websocket`

**状态**：passed
**策略**：真实Capture Messages；现有WebSocket流量库；方向/载荷/连接隔离

Binary行排版目标：在原ws-binary的Sent/Received两方向各保存`websocket-binary-row-{sent,received}.json/png`，核对消息行38px、mono10.5px、自然行高和父行center。该值来自设计消息行，不用固定像素补偿单个Binary标签；现有内容/Copy/方向和Tree/UTF-8步骤不变。

Compact正文尺寸：在真实binary JSON消息默认Pretty档、切Tree之前保存`websocket-compact-code-height.json/png`。五行仍各20px、字号12px、上下padding各13px；外框等于实际文字内容加padding及设备上实际边框，不再额外预留固定8px滚动条。先在旧外框取得Red，修复后同一workflow复验，Tree/Copy/全屏和原协议步骤保持。

### Steps

1. fresh profile经UI开启Recording，经真实WebSocket binary帧发送`{"buildId":8431,"state":"running","branch":"main"}`并由origin完整echo，校验返回字节与binary标志，以1000关闭；从自产Capture行进入Messages/Sent，展开消息并选择Tree。通过已有通用二进制内容探测进入JSON，不修改Core MIME；text帧有明确文本MIME，不强行要求Tree。实际树面板必须容纳全部五行，不能只剩边框/padding；通过DOM状态切换根节点折叠/展开并核对高度随内容变化，正文Copy必须等于原始JSON。全屏保留原MIME/Save与同消息，关闭后保留Tree；保存改前/改后截图与树面板尺寸JSON。该步骤在旧四场景前执行，避免把相邻历史selector失败当目标Red。
2. 依次运行已有Text、Binary、Bidirectional和Control默认场景，每个独立WebSocket经8888产生真实101握手并以1000关闭。
3. 选择自产Capture行，进入Messages并切换Sent/Received/All；Text各方向1条，Binary各方向1条，双向场景Sent 1条/Received 2条。
4. 文本载荷分别为`hello from client`、`client message`、`origin message`；Binary为`00 01 02 03 ff`，逐行展开并用真实Copy验证完整值。
	展开后的载荷标题必须显示当前语言的方向和类型，不得泄漏`capture.text`等资源键；通过自产帧的Copy automation ID定位标题，不切换语言或用翻译文案定位。文本发送/接收两态分别保存真实截图。
5. Control场景完成Ping/Pong/Close协议交互；按现有产品语义不把控制帧伪造为数据消息行，Messages为0条。空态保留116px最小高度、12px字体及flex双轴居中布局，不退回未应用样式的默认黑字。
6. 每条场景关闭Inspector，不串连接；保存逐场景身份、trace与截图，Renderer无page error，fixture验证连接、Main/Core/Worker、8888和WinINet/journal恢复。

`ws-control`保存`websocket-control-empty-state.png`及`websocket-empty-presentation.json`，核对真实Messages空态和计算样式；该场景只有控制帧，0条数据消息符合当前产品边界。加载、空结果与错误状态另有明暗parity；不改正文或帧断言掩盖样式问题。

真实大文本消息使预览边界落在四字节字符内，origin和客户端收到完整消息，行预览、专用Copy、展开正文Copy与编辑器内容仅保留完整字符前缀。

<a id="capture-scenarios-grpc"></a>
## `capture.scenarios.grpc`

**状态**：passed
**策略**：真实gRPC Inspector；正式CA/MITM UI；现有H2流量库

### Steps

1. fresh profile通过Certificates UI确认共享CA就绪、添加localhost源站例外并启用MITM；经UI启用Recording，不重复生成/安装CA。
	- 新增streaming步骤先运行：复用`TlsTrafficRunner`与受控响应流，经真实8888/TLS/H2发送JSON gRPC。仅到达3-byte header时消息为0；收齐第一条envelope后，响应未结束时消息为1且真实Copy正确；第二条payload未收齐时仍为1，补齐后为2且Copy正确。最后结束流并核对实际grpc-status 0；全过程不调用业务API替代UI。
	- 进行中失败必须先保存`grpc-streaming.png`与`grpc-streaming.json`，记录客户端是否结束、源站输入流是否结束及实际消息数，再结束流和恢复CA/Root，不能用流结束后出现消息的截图冒充前置状态。
	- 系统背景流量触发TLS compatibility时，共享driver用公共automation ID定位Not now控件真实激活，不自动添加host或修改MITM策略；handler保持至Page关闭，清理不重复注册或点击。macOS异步handler只操作本次取得的按钮节点；旧节点不存在或detach时不等待替代按钮，新提示继续由actionability处理，其他操作错误不得吞掉。弹窗挡点击的失败不算目标Red。
	- Pause/Resume与Clear分别创建新H2 stream：第一条消息出现后真实点击Recording暂停或Clear，再发送第二条。暂停时第二条仍可查看和Copy，完整结束后恢复Recording；Clear后旧行与消息保持消失，真实两条消息及trailers仍完整到达client，后续五个原场景仍可产生新Capture记录。保存各自进行中和最终状态JSON，不把Clear当作断开网络。
	- 双向streaming同时保持Request/Response未结束，各先发送一条完整JSON消息，再发送第二条缺两字节的payload；逐侧核对第一条可Copy、半条不生成消息，补齐后第二条出现且Copy正确。每次Copy时两侧均未结束，最后共同结束并核对实际请求/响应字节与trailers；保存`grpc-bidirectional-streaming.json/png`。
2. 逐个运行Unary proto、Unary JSON、Trailers error、Compressed及Malformed场景，确认实际H2/200和grpc-status为0/13；不将HTTP 200当gRPC业务成功。
3. 真实选择Capture H2行并打开gRPC；逐侧切换Request/Response，校验消息数、声明载荷长度和`@ 0x0005`偏移。
4. 用真实Copy核对proto Hex、JSON文本及gzip原始压缩字节；Malformed仅响应末尾少两个字节，请求保持完整，UI声明长度保留，Copy只返回实际字节。
5. status 13的Response消息为0，UI显示`grpc-status: 13`和`grpc-message: Playground failure`，不制造响应消息。
6. 保存逐场景身份、trace与截图，Renderer无page error；finally通过UI停用MITM、移除例外，保留共享CA并比较Root集合，fixture验证Main/Core/Worker、8888、完整系统代理/journal恢复。超时优先恢复宿主，缺trace和未完成的UI清理必须明确记录，不能算Green。

多消息边界：Request与Response各两条JSON消息，分别把三/四字节字符放在大消息预览边界，并用完整小消息验证相邻offset；专用Copy、Raw Copy与编辑器内容逐条比较长度/SHA256，不读入下一条envelope。

<a id="capture-scenarios-tls"></a>
## `capture.scenarios.tls`

**状态**：macOS原38帧流程及新增末尾Certificates清理已完整通过，最新来源`2026-10-21T15-08-55-695Z-hFPcCP`；包含产品Save生成25字节文件、缺失路径404/27字节提示、修正后200/25字节原文、停用后404/空正文、Edge系统信任及正常退出/宿主恢复。原`2026-10-21T13-36-04-054Z-XO6oHx`保留；新增Map Local文件段的Windows验证尚未执行。
**策略**：真实TLS/CONNECT；正式Certificates UI；同代解密前后对比

### Steps

1. fresh profile只开启Recording，运行`tls-passthrough`；真实TLS握手完成但不发HTTP应用字节，Capture仅显示localhost的CONNECT/TLS行。
2. 打开Tunnel，核对目标和端口；没有Response标签或正文预览。通过`capture.inspector.setup-https`打开HTTPS设置，确认连接示意可见；共享CA已就绪，Generate/Install不显示，Start decrypting可用。截图后Cancel，仍无正文和CA副作用。
3. 经真实Certificates UI确认共享CA受信任，添加localhost源站例外并开启MITM，不重复Generate/Install，不调用Manager。
4. 依次运行`tls-mitm-h1`与`tls-mitm-h2`，分别验证实际ALPN为http/1.1与h2、Capture显示对应GET/200行，Response Raw显示mode与secure字段。
5. TLS页显示https、localhost、本轮端口和TLS事实。原HTTPS请求经Map Remote转到本轮HTTP目标，客户端和Capture核对200及`owned-http-mapping-result`；从当前Response使用产品Save和原生Dialog生成本轮文件，核对25字节/hash。保持原停用/Save、新`/disabled`请求404和Capture行断言。
6. 同一规则改用Map Local：真实填写不存在路径、启用/Save，HTTPS缺失文件请求得到404与明确正文；将路径修正为第5步产品生成的文件并Save，HTTPS返回200且字节等于文件；停用/Save后新HTTPS请求回到原服务404/空正文。每次Capture仅搜索该次自产path，完成业务断言后再截图，不能以截图延迟替代验证。
7. 另启动独立Edge，经8888访问同一origin的`/playground/tls/browser-trust`固定页面，保留默认HTTPS校验，不指定CA或忽略证书错误。要求200、浏览器securityState为secure、localhost叶证书由当前共享CA签名；协议客户端的`rejectUnauthorized: false`不能代替这项验收。
   - fresh profile的数据库父目录由Workspace初始化负责；不得以漏读TLS偏好后的临时Mockttp CA冒充共享CA。失败时保留profile及公开证书链/安全状态供诊断，原错误继续抛出，不跳过浏览器校验或重试后覆盖失败。
8. 保存三个场景、两种映射证据、产品生成文件attachment、浏览器security state和公开证书指纹，保留原Renderer无page error断言。完成浏览器验收后先关闭Edge，再进入Settings/Certificates；确认MITM仍开且本轮localhost例外存在，真实关闭MITM并检查`aria-checked=false`后截图。定位localhost chip，拍移除前的实际对象后点击其Remove；确认该chip消失、MITM仍关，再拍剩余host输入框与清理后的页面。不能拿Capture的规则停用图代替这两个设置操作。
9. finally仍关闭尚未退出的Edge、调用原`cleanHttpsCapture()`并删除本轮文件原路径；该helper对已关闭MITM/已移除localhost跳过重复操作，但照常检查共享CA指纹与系统信任，随后原Root集合断言和fixture的origin/Main/Core/Worker、8888、完整系统代理/journal恢复全部保留。任意新增UI或截图失败仍进入这一清理路径，不添加测试后门或延长timeout。

<a id="capture-tools-archive-transfer"></a>
## `capture.tools.archive-transfer`

**状态**：既有流程passed；新增公开路由隔离、UI同文件8→16追加与English检查点已通过，来源`2026-10-21T17-26-41-702Z-Sz4VPq`中的Archive独立测试
**策略**：native-ui；Windows/macOS；两代真实Electron；host-safety-guard

### Steps

1. 独立profile启动真实Electron并开启Recording；通过Settings → Proxy → Restore恢复原系统代理，再通过Capture Clear清理本profile临时录制，不修改个人代理值。显式loopback HTTP与WebSocket客户端仍经8888生成两条自产输入，UI确认完整正文和双向消息；全量归档不能混入启动时的个人流量。
2. 通过Settings配置本地Provider；Ask Chat发现`capture_export_archive`与`capture_import_archive`，二者只接受空参数。
3. Agent Ask Deny不打开原生Dialog；Allow导出先真实Cancel，再Allow选择路径，查询任务到成功并核对产品输出归档，不能测试预造文件。
4. UI Clear之后通过Agent Allow导入同一产品文件，先取消原生Open，再确认导入；已挂载Capture自动恢复HTTP正文与WebSocket消息，不依赖切换页面。
5. Agent Auto导出仍显示Save，Auto导入仍显示Open；再导入时追加完整数据，已有Capture不被清空。结果和Transcript只含安全任务字段或取消摘要。
6. 关闭Agent两项权限，旧Chat无法调用；产品UI创建MCP Client，独立开启MCP权限并验证Ask Deny/Allow、原生取消、Auto导出及追加导入。
7. 原UI Archive Export/Import也完成同组操作，使用同一Main方法。此前Tool追加后，UI Export当前8条记录到`ui.iarchive`；UI Import必须再选择这份同次UI导出的`ui.iarchive`，追加后为16条，并查看恢复的HTTP正文与WebSocket消息。早先`complete.iarchive`是另一份Tool导出文件，不能用它代替本段的UI文件或计数。菜单条目使用`display: flex`与`align-items: center`，16px行高、9px/10px padding，扩展名`.iarchive`为9.5px文字及2px/6px padding；总高为38px加扩展名上下边框，DPR=2时40px、DPR=1.5时39.3333px，按真实设备像素校验。Export说明/敏感警示均为12px文字、11px/13px内边距及15px图标，黄/红两种状态不混用。先点击产品Cancel再重新Export；Import保留单个说明警示。分别拍菜单、警告、取消返回、确认、保存与结果，完成真实Save/Open及原文件完整性断言；MCP撤权后旧连接不能披露或执行两项Tool。
8. 正常关闭并保存trace/evidence；同profile重启，权限保持，Model/origin/文件操作零重放。两代Main/Core/Worker全部退出，8888释放，完整WinINet或macOS多network service代理、共享journal与证书信任恢复后清理产品文件。MCP与原生Dialog步骤只记录Tool名称、模式和操作，不在步骤标题中包含凭据、路径或正文。

### 预期与证据

- 前置Red必须来自缺失Tool或目标行为未实现，不能用selector、原生Dialog、构建或环境失败替代。
- 文件内容只在测试本地核对完整性；审批、Tool结果、Transcript及脱敏证据不含凭据、正文、本机路径或文件名。
- Export保存全量原生证据而不是HAR转换；Import保留WebSocket消息与完整正文，追加数据并通过正式通知刷新UI。

<a id="capture-playground-traffic"></a>
## `capture.playground-traffic`

**状态**：passed

**策略**：os-side-effect

### Steps

1. 创建fresh profile、trace与独立Playground端口；启动真实Electron并等待Core与8888，使用产品UI开启Recording。
2. 系统Edge打开真实`apps/playground`，确认默认Capture Lab、41项目录、Capture专属Header与可编辑Draft。
3. 选择`h1-json`并点击Run；等待Playground显示complete。
4. 在真实Capture中等待自产`/playground/h1-json`行，选择后进入Response，验证h1和`ord_42`正文。
5. 回到Edge选择`ws-text`并点击Run；等待Playground显示complete。
6. 在真实Capture中等待自产`/playground/ws/text`行，选择后进入Messages，验证双向自产text message。
7. 保存Root基线，通过产品UI开启HTTPS解密并添加localhost源站例外；在Playground分别选择`h2-error-goaway-client`与`h2-error-goaway-origin`并点击Run，保留默认POST。
8. 两场景均只在客户端实际收到256 KiB后发送错误码2的GOAWAY，响应声明512 KiB；读取真实Lab响应与页面Protocol证据，核对部分正文/hash、源站POST次数1、独立新连接恢复请求200。`failed`表示这次HTTP响应被故意中断，不自动填写人工Pass。
9. 在真实Capture按各场景路径定位原POST行，等待同一行保留H2/200/256 KB及非占位耗时；点击Response查看已收到的正文，Headers保留声明的512 KiB，不补全、不重放；恢复GET另有200行。保存Browser/产品截图、网络事实、trace；精确1秒与取消边界仍由Core回归验证。
10. 通过产品UI清理本轮MITM与localhost配置，核对Root基线；关闭Edge与Playground；正常Close Electron并验证Main/Core退出、8888/Playground端口释放、系统代理恢复与profile删除。

### 预期效果

Playground不是直接构造Core状态的测试后门；真实Browser点击自产流量进入产品Capture，H1正文、WebSocket消息及H2错误GOAWAY后的部分正文均可在产品UI检查，退出不遗留listener或系统副作用。Playground页面与真实Electron共同覆盖新增GOAWAY入口，不以既有H1/WS结果代替。

<a id="capture-recording-pause-resume"></a>
## `capture.recording.pause-resume`

**状态**：passed
**策略**：os-side-effect

### Steps

1. 创建空profile、evidence与本轮HTTP/WebSocket loopback origin；启动trace和真实Electron，等待App/Core/8888。通过公开Recording/readiness控件开始录制，不切换语言。
2. 通过公开Keyword筛选本workflow自产路径；经8888发送HTTP请求A并建立WebSocket连接A，发送自产文本并检查origin收到、客户端echo和Messages双向记录。记录这两条Capture行的公开身份，不把其他应用的系统代理流量算入本workflow。
3. 点击`capture.recording.toggle`暂停，`aria-pressed=false`；发送HTTP请求B并确认仍得到200但无对应行；在已录制连接A发送第二条文本，双向消息继续完整记录。
4. 暂停期间建立WebSocket连接B并发送自产文本；origin和客户端双向成功，但Capture不得创建B的行、消息或正文。此时筛选内仍只有A的HTTP与WebSocket两条记录。
5. 点击Recording恢复，`aria-pressed=true`；在B继续发送不同文本并真实Close，echo成功且B仍没有Capture行，筛选内的两条行身份与暂停时完全相同。恢复后其他应用可以创建新记录，因此不要求全局Storage总数恒定；无主正文与精确Exchange/Body计数由使用真实CaptureService、BodyStore和独立代理端口的[Core存储回归](../../../../proxy-core/src/proxy-core/proxy/tests/integration/recording-body-ownership.test.ts)验证，包括Proxy停止后数据仍保留且用量未增加。
6. 恢复后发送HTTP请求C并建立WebSocket连接C，确认新Capture行和C的双向消息可见；A/B/C都用真实Close握手结束，origin关闭码为1000。
7. 保存自产请求路径、消息、前后公开行身份、trace与截图；Renderer无page error，Main/Core无`websocket.persist-failed`。Core回归保持完整存储数值断言，不以真实E2E的筛选行数替代。
8. fixture点击`shell.window.close`，由Main退出流程恢复仍owned的系统代理；确认Main/Core/Worker全部退出、8888释放、WinINet与共享journal恢复，再删除本轮profile和网络fixture。不主动Restore代替退出恢复验证。

### 预期效果

Stop只暂停记录，不停止listener或系统代理，不删除旧记录；录制决定以HTTP请求/WebSocket握手开始时状态为准。暂停期间流量继续转发，Resume不能为旧的未录制连接创建孤立消息、正文或等待者；恢复后的新请求继续在同一Core代际追加。退出必须恢复系统代理及进程资源。

<a id="capture-proxy-readiness-resolve"></a>
## `capture.proxy-readiness.resolve`

**状态**：planned
**策略**：os-side-effect

### Steps

1. 创建fresh profile/evidence，启动trace和新Electron；等待App/Core/8888。
2. 验证Proxy not ready modal及 `capture.readiness.close/cancel/open-proxy-settings/enable`，状态为System Proxy off或ownership lost。
3. 点击 `capture.readiness.cancel`；确认modal关闭、Paused/Not recording，系统代理UI状态未改变。
4. 点击 `capture.recording.toggle` 重新触发modal，再点击 `capture.readiness.open-proxy-settings`。
5. 验证Settings自动进入Proxy section：Listener=Listening、Address=8888、非Owned、journal=Protected、Enable可用。
6. 返回Capture，重新触发modal并点击 `capture.readiness.enable`；完成App发起的原生授权。
7. 等待Recording；进入Proxy page确认Owned、Owned by Interceptor、Current configuration=8888及真实bypass/PAC字段。
8. 点击 `settings.proxy.restore`；确认原系统配置恢复、ownership清除；返回Capture确认Paused。
9. 保存evidence，点击 `shell.window.close`。
10. 验证Main/Core/Worker全退、8888释放、journal清理，再删除profile。

### 预期效果

Cancel和打开设置均无隐式系统写入；只有用户点击Enable后才接管代理；失败显示有界错误且不循环静默重试；Restore遵守ownership guard。

<a id="capture-traffic-capture-select"></a>
## `capture.traffic.capture-select`

**状态**：passed
**策略**：privileged UI

### Steps

1. 创建fresh profile/evidence和HTTP loopback origin；启动trace与新Electron。
2. 等待App/Core/8888和readiness modal；确认Capture空列表、Paused/Not recording、System Proxy未owned；点击 `capture.readiness.enable`并完成授权，等待Recording。
3. 测试客户端显式通过8888发送POST `/e2e/capture/details?source=workflow`，带固定header/body。
4. 等待动态 `capture.request-row.<exchangeId>` 出现，检查row的POST、host/path、200、h1、json、bytes和duration。
5. 点击该row。
6. 验证Inspector summary的method、host、path、200 OK和完整Request URL。
7. 验证General数据来自同一Exchange而非静态fixture。
8. 进入Settings Proxy点击 `settings.proxy.restore`，确认非owned和Paused；保存evidence，点击 `shell.window.close`。
9. 验证Main/Core/Worker全退、8888释放且系统代理保持恢复状态。
10. 关闭origin并删除profile。

### 预期效果

真实HTTP请求经listener、Mockttp、Core Capture、事件推送进入虚拟列表；点击row后按需取得真实detail；所有metadata与客户端发送/接收结果一致。

<a id="capture-inspector-section-collapse"></a>
## `capture.inspector.section-collapse`

**状态**：passed
**策略**：privileged UI

### Steps

1. 创建独立profile、trace与HTTP loopback origin；启动本地production Electron，等待App/Core/8888并收敛fresh-profile readiness。
2. 通过`capture.recording.toggle`与`capture.readiness.enable`开始真实Recording；客户端显式经8888发送`GET /e2e/capture/section-collapse`，等待动态row并点击进入Inspector。
3. 用`capture.inspector.section.general`与`capture.inspector.section.response-headers`定位两个真实标题按钮；确认初始`aria-expanded=true`，各自`aria-controls`指向仍挂载且`hidden=false`的唯一正文。两个标题都使用36px最小高度和flex居中，折叠后最小高度不变，不设置固定高度来裁切较高内容。
4. 折叠General，确认其正文`hidden=true`，Response Headers保持展开；再折叠Response Headers并重新展开General，确认同一`aria-controls`正文恢复且两段状态互不覆盖。
5. 切换Timing，通过分组的公共控件与`aria-controls`定位两行内容；标签和时长保留真实文字。父行使用flex、align-items:center、自然行高和12px gap；标签列150px、时长列58px，6px高的比例条flex占剩余宽度。记录实际样式与截图，不用字形或自算矩形中心定义对齐，不改时序数据。
6. 保存截图、trace、日志与metadata；正常Close并验证Main/Core/Renderer退出、8888释放、系统代理恢复和profile删除。

### 预期效果

标题按钮与正文有稳定无障碍关系；折叠一段不改变同pane其他段；正文折叠时不卸载，内部查看状态不会因收起而丢失。

<a id="capture-filter-keyword"></a>
## `capture.filter.keyword`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和HTTP origin；启动trace/Electron，等待App/Core/8888/readiness；只检查Capture相关默认态：列表空、keyword空、System Proxy未owned、Paused。
2. 点击 `capture.readiness.enable`并完成授权，等待Recording；通过8888制造 `/e2e/filter/alpha` 与 `/e2e/filter/beta` 两条真实请求。
3. 等待两个动态request row和`2 of 2`。
4. 在 `capture.filter.keyword` 输入 `alpha`。
5. 验证alpha可见、beta隐藏、计数为`1 of 2`。
6. 把输入改成host片段，验证两条均按host匹配。
7. 清空输入，验证两条恢复、顺序和选择不变、计数回到`2 of 2`。
8. 进入Proxy点击Restore，确认非owned；保存evidence并点击Close。
9. 验证进程/8888销毁和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

Keyword只过滤视图，不删除全量Capture；计数与可见row同步；清空后完整恢复。

<a id="capture-filter-structured"></a>
## `capture.filter.structured`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和loopback origin；启动trace/Electron，等待App/Core/8888/readiness；检查结构化filters均为空、列表空、Paused。
2. 点击 `capture.readiness.enable`并完成授权，等待Recording；制造method与status各不相同的真实请求集合。
3. 点击 `capture.filter.add` 打开Add filter；确认只列出Method与Status两项，hint预览当前列表出现的值。
4. 点击 `capture.filter.option.method` 进入级联，从列表实际出现的值中点选（如POST）；确认生成method pill、可见row与计数同步收窄。
5. 再次打开Add filter→`capture.filter.option.status`，从实际出现的值中点选（如404）；`capture.filter.back` 可返回上一级。
6. 通过 `capture.filter.remove.method` 与 `capture.filter.remove.status` 逐项移除。
7. 验证每次只清目标字段，最终恢复全量与原排序。
8. 进入Proxy点击Restore，确认非owned；保存evidence并点击Close。
9. 验证Main/Core/Worker销毁、8888释放和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

五类结构化条件正确规范化并以AND组合；非法值不污染filter；pill移除精确；列表和计数始终一致。

<a id="capture-filter-group-selection"></a>
## `capture.filter-group-selection`

**状态**：passed
**策略**：shared

### Steps

1. 创建fresh profile并启动仓库本地production bundle；开启BrowserContext trace，等待真实Electron Renderer、Core PID和`127.0.0.1:8888` listener ready。Fresh profile出现Proxy readiness时只点击Cancel，不修改系统代理。
2. 通过`capture.filter.toggle.status`展开Status组，确认`aria-expanded=true`且永久Pending option可见。
3. 点击`capture.filter.option.status.<pending>`选择该option；确认筛选生效后toggle仍为`aria-expanded=true`、option仍可见。
4. 再次点击同一option取消选择；确认组继续展开。对Content type组重复相同选择/取消流程，证明非Application分组不依赖默认展开状态。
5. 附加每次点击后的`aria-expanded`证据、最终截图、trace、Main/Renderer日志和metadata；正常Close。
6. 验证Main/Core PID退出、8888可重新bind、profile删除且系统代理从未被修改。

### 预期效果

option选择与分组展开是正交状态；选择或取消option只更新筛选条件，只有标题或chevron可以折叠分组。该workflow用于证明真实产品Renderer没有设计fixture的状态重置缺陷。

<a id="capture-filter-protocol"></a>
## `capture.filter.protocol`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和H1/WS/H2 origins；启动trace/Electron，等待App/Core/8888/readiness；检查protocol=All、列表空、CA absent、MITM off。
2. 点击readiness Enable并完成授权；从App UI Generate、Install CA，添加`localhost`例外并Start decrypting，等待Recording和MITM active。
3. 制造真实HTTP/1.1、HTTP/2和WS记录；等待三个动态rows。
4. 点击 `capture.protocol.h1`，验证只显示H1。
5. 点击 `capture.protocol.h2`，验证只显示H2。
6. 点击 `capture.protocol.ws`，验证只显示WS handshake。
7. 点击 `capture.protocol.all`，验证全部恢复与计数正确。
8. 从UI关闭MITM、移除host例外、Uninstall/Delete CA并点击 `settings.proxy.restore`；确认非owned、Not generated、Paused。
9. 保存evidence并点击Close；验证进程/8888销毁和系统副作用恢复。
10. 关闭lab并删除profile。

### 预期效果

协议段基于规范化protocol筛选；All/H1/H2/WS互不混淆；TLS tunnel保持独立。

<a id="capture-facet-stable-ordering"></a>
## `capture.facet-stable-ordering`

**状态**：passed
**策略**：privileged UI

### Steps

1. 为该test创建独立`userData`目录和loopback origin，启动BrowserContext trace与仓库本地production bundle；等待`app.root`、真实Main/Core PID和`127.0.0.1:8888` listener。
2. 点击`capture.recording.toggle`；在Proxy readiness中点击`capture.readiness.enable`，等待Recording的`aria-pressed=true`。
3. 显式proxy客户端先发送`GET /e2e/facet-order/get-first`，再发送`POST /e2e/facet-order/post-first`；两次都必须从真实origin取得200，并等待两条公开`capture.request-row.<exchangeId>`进入Renderer。
4. 点击`capture.filter.toggle.method`展开Method；按原始DOM顺序读取组内`capture.filter.option.method.*`，必须是GET、POST。
5. 显式proxy客户端再发送`POST /e2e/facet-order/post-second`；等待POST count变成2后，不使用排序后的测试侧副本，再次读取原始DOM顺序，仍必须是GET、POST。
6. 点击`capture.recording.toggle`停止Recording并确认`aria-pressed=false`。Method组头与All的计数必须相同且不少于3；用同一次只读DOM快照比较，不能把GET/POST两个选项当作两条request，也不假设系统背景流量不存在。
7. 附加`facet-stable-order.json`、`facet-request-counts`、最终截图、trace、Main/Renderer日志和metadata。
8. 通过`shell.window.close`正常关闭应用，由Main退出流程恢复仍由Interceptor持有的系统代理。
9. 验证Main、Renderer、Core与Worker退出、8888可重新bind，然后删除profile和loopback fixture。

### 预期效果

动态facet按当前Capture中的首次出现顺序挂载。后出现值的count反超时只更新数字，不移动既有option DOM。组头和各取值的计数均使用request单位；Method中的每条request只归入一个方法，组头因此与All一致。

<a id="capture-clear-facets"></a>
## `capture.clear-facets`

**状态**：passed
**策略**：privileged UI

### Steps

1. 创建独立profile、trace与loopback origin，启动真实Electron并等待App、Core与8888；通过真实UI开始Recording。
2. 开始Recording后通过Settings → Proxy → Restore恢复journal中的original，确认完整系统值匹配且journal已移除；回到Capture核对控件显示Paused、Keyword为空，再正常Clear本profile临时数据。展开Method，经8888显式发送原自产GET并选中该行，不再点击Recording或重新启用系统代理。每次截图前后读取完整列表和七组计数：仅该行，前六组为1、未命中规则的Rule为0；残留外部连接污染时失败，不用Keyword隐藏。保留原GET非零计数及清空前实际计数记录；Paused只是此处UI显示，不作为Core停录证据。
3. 核对清空筛选按钮disabled且opacity为0.35；真实点击GET option后按钮enabled且opacity为1。点击清空筛选，GET恢复`aria-pressed=false`、按钮重新disabled且opacity为0.35；自产请求和Inspector仍可见，不把清空筛选实现为清空记录。
4. 在facet快照完成更新后点击`capture.clear`，等待Capture行数量变为0。
5. 不使用Playwright auto-retry，直接在同一断言点读取全部facet组头计数、GET option数量与当前选中行数量；必须全部为0。Application、Status、Content type仍保留Pending 0入口，但组头不能因此显示1。
6. 保存Clear前后原始DOM快照、trace、日志与metadata；正常Close并验证Main/Core退出、8888释放、系统代理恢复和profile删除。

### 预期效果

Clear是空rows的同步边界：列表、selection与facet snapshot在同一次可见状态推进中归零，不允许facet继续显示旧count/options最多600ms。

<a id="capture-breakpoint-menu-hierarchy"></a>
## `capture.breakpoint-menu-hierarchy`

**状态**：原几何断言与新增Block/Endpoint实际执行检查点已完整通过，来源`2026-10-21T19-33-47-163Z-5INkK1`
**策略**：privileged UI

### Steps

1. 创建独立profile、trace与loopback origin，启动真实Electron并通过真实UI开始Recording。
2. 以原自产路径`/e2e/capture/breakpoint-menu-hierarchy`筛选并收起无关facet，经8888发送原GET；选中原记录并从公开`capture.request-row.<exchangeId>`提取稳定exchangeId。
3. 在该行触发真实contextmenu，等待`capture.create-rule.<exchangeId>.block`与`.breakpoint`可见；读取两个语义label的bounding box，要求文字左缘差小于1px。
4. Hover Breakpoint，确认`capture.create-breakpoint.<exchangeId>.endpoint`可见；按Escape关闭菜单。
5. 再打开原记录菜单并选择Block；Rules中产生URL exact matcher、reset动作的未启用草稿。命名`Capture quick block`、启用并Save，等待公开状态为applied。新GET必须真实连接失败、origin计数不增加，但Capture新增独立行；不能把历史行说成新执行结果。
6. 通过Rules停用该Block并Save，再发新GET恢复200。返回最初那条历史记录打开Breakpoint → Endpoint；创建成功提示出现后仅关闭提示，不手动重复Enable/Save。
7. 再发同URL新GET，先暂停于request：origin尚未增加、公共Header编辑字段含`host`。点击Continue后同一Capture行改为新的breakpointId，origin已接收一次，Header字段含响应侧`x-interceptor-e2e`，客户端仍未完成；再Continue得到完整200。由真实Header和请求计数区分两阶段，不用翻译后的phase文案或Store查询。
8. 停用本轮两条快捷规则并Save，最后一个新GET直接完成200。失败时仅中止本轮显式客户端，并通过Rules UI停用本profile规则；不遗留等待项。
9. 保存原几何证据及`capture-shortcut-actions.json`中的实际URL、规则/请求/两阶段身份、origin计数；正常Close并验证Main/Core退出、8888释放、系统代理恢复和profile删除。

### 预期效果

Breakpoint submenu与Block同属Control group，icon、语义label与hint使用同一行布局；Breakpoint不因额外submenu DOM包装而右移，二级菜单仍可通过hover展开。

<a id="capture-breakpoint-submenu-lifecycle"></a>
## `capture.breakpoint-submenu-lifecycle`

**状态**：原菜单生命周期及新增Manager/Undo、HTTP客户端取消均已通过，来源`2026-10-21T19-44-10-238Z-JNfI58`
**策略**：privileged UI

### Steps

1. 创建独立profile、trace与loopback origin，启动真实Electron并通过真实UI开始Recording。
2. 经8888发送一条测试自产GET，等待动态Capture行出现，并从公开`capture.request-row.<exchangeId>`提取exchangeId。
3. 在行右边界触发contextmenu；确认公开根菜单标记和Breakpoint trigger可见。
4. Hover Breakpoint；确认公开submenu标记与endpoint item可见，同时根菜单标记仍挂载。右边空间不足时，submenu标题横坐标必须小于根菜单标题，且两者均位于viewport内。
5. Hover根菜单Block项；等待submenu关闭，同时根菜单保持。再次hover Breakpoint并进入endpoint item，根菜单仍保持。
6. 按Escape；根菜单与submenu同时消失。重新打开并展开submenu，点击App statusbar空白处；两层再次同时消失。
7. 完成下述Manager、Undo及HTTP客户端取消操作，保留共存、翻转、hover close/reopen与两种dismiss证据。
8. 正常Close并验证Main/Core退出、8888释放、系统代理恢复和profile删除。

### Manager 与 Undo 的实际操作

- 在原菜单hover/贴边翻转/Escape/outside-click断言后，从同一历史请求实际创建Endpoint；新请求的request/response分别Continue，证明创建即应用，不由后续手动Save补足。
- Manager从公开`capture.breakpoint-manager`打开；全局开关使用`breakpoints.toggle`。逐规则控件没有独立automation ID，按本轮自产URL的`code`摘要找到同一行内的`role=switch`与唯一View rule按钮，不按翻译后的label、CSS class或Store定位。
- 停用/启用该规则后，从同一行View rule进入Rules，等待公开`rules.status.state`为applied，再分别用新请求证明直通/双阶段暂停；不额外点击Save掩盖Manager未自动持久化。
- 无pending时关闭/开启全局Break on match；Recording与代理不变。新请求分别直接完成/双阶段暂停，不把Recording按钮当全局断点开关。
- 全局重新开启后，用本轮可取消客户端产生Request队首，再真实abort：该等待ID解除、客户端失败且origin次数不变。随后新请求必须使用不同等待ID，再分别Continue请求/响应，不用WebSocket断开图代替HTTP客户端取消。
- 保留前一条真实管理规则但将其停用，再从原历史请求创建另一条Endpoint。通过Rules UI确认两个公开身份，真实hover暂留成功提示并点击Undo；必须只删除新规则，原规则身份及停用状态保留、状态已applied。全局仍开时再发新请求直接完成，证明Undo不是仅关闭消息。
- 正常清理只中止本轮客户端、停用本profile规则并恢复全局开关；不创建占位规则、不操作其他profile、不直接调Preload/Store或改业务API返回值。保存`capture-breakpoint-manager-actions.json`与原几何证据。

### 预期效果

Breakpoint submenu由同一Ant Menu树管理：hover展开不会用第二页替换根菜单；指针可在父子菜单间移动；右边界自动向左翻转；Escape与outside click都销毁整棵菜单。

<a id="capture-navigate-tls-passthrough"></a>
## `capture.navigate-tls-passthrough`

**状态**：既有导航、列表布局和同URL三连接HTTPS透传往返均已通过，来源`2026-10-21T18-54-54-381Z-if8Bkz`
**策略**：privileged UI

### Steps

1. 创建独立profile、trace与loopback tunnel lab；启动真实Electron并通过真实UI开始Recording。
2. 通过产品UI确认共享CA就绪、开启MITM，再在Settings / TLS passthrough添加`127.0.0.1`，返回Capture；不重复生成或安装CA。
3. 经8888向测试自产随机端口建立真实CONNECT，完成原TCP回显，等待动态Capture行并打开Tunnel Inspector。该段保留TCP导航断言，不把回显本身当作真实HTTPS解密/恢复证据。
4. 点击公开`capture.tls-tunnel.view-passthrough-pattern`；确认App切到Settings，激活TLS passthrough section。
5. 确认产品从当前持久化settings解析出精确覆盖项`127.0.0.1`，对应公开host row滚入可见区域并带`data-highlighted=true`。保存target-layout，确认host/说明14px行高、2px文字组gap，行高不小于66px；不通过修改TLS设置制造推荐标签。
6. 等待3秒后确认同一row仍存在但`data-highlighted=false`；再次从Capture执行跳转时高亮重新出现，证明timer被重新计时。
7. 在最终清理前追加受控`localhost`的真实HTTPS往返：通过Certificates确认共享CA与本轮源站例外，向同一HTTPS URL建立第一条新连接并读取解密后的HTTP正文；添加精确`localhost`透传项后重新连接，同一URL变为Tunnel；从匹配入口定位实际设置，删除该精确项后再次新建连接，同一URL恢复可读HTTP正文。每次都重新建立连接，不将原TCP回显或不同URL混作这三次结果；分别保留CA/例外、添加、命中、定位、移除和恢复画面。
8. 通过Settings UI删除本profile创建的测试pattern与源站例外、关闭MITM，保留共享CA及信任，保存trace、最终截图与Main/Renderer日志；正常Close。
9. 验证Main/Core退出、8888释放、系统代理恢复、profile删除。

### 预期效果

Tunnel入口导航到实际覆盖当前host的最具体持久化pattern；Settings列表自动滚动并提供短暂、可重复的定位反馈。导航不新增pattern、不持久化高亮，也不把wildcard覆盖误显示为精确host配置。E2E用无外部DNS依赖的精确IP验证真实flow；unit另锁定exact优先与多层wildcard选择最长suffix。

### 验收要求

- 导航入口和目标row的公开高亮状态必须可检查；selector、构建、UAC或fixture失败不算产品故障。
- 必须验证目标pattern、滚动可见、3秒消退、重复计时、配置清理、Main/Core销毁、8888释放与系统代理恢复。

<a id="capture-facets-clear-menu"></a>
## `capture.facets-clear-menu`

**状态**：planned
**策略**：privileged UI

### Steps

1. 为该test创建独立`userData`目录并启动仓库本地production bundle；开启BrowserContext trace，等待`app.root`、带真实PID的Core状态和`127.0.0.1:8888`可连接。
2. Fresh profile首次出现Proxy readiness时点击`capture.readiness.cancel`，确认测试arrange未写系统代理。随后点击`capture.recording.toggle`，在再次出现的readiness点击`capture.readiness.enable`并完成Windows授权，等待Recording的`aria-pressed=true`。
3. 经Settings → Proxy → Restore恢复journal中的original，核对完整系统代理匹配且journal已移除；返回Capture核对控件显示Paused、Keyword为空，再通过Clear清空本profile临时录制。此后不再点击Recording或重新接管系统路由。展开Application、Status与Content type，确认三个Pending option即使count=0也存在。显式客户端仍连接8888，先发`GET /e2e/facets/get-first`，再发`POST /e2e/facets/post-first`；两次都必须取得真实origin 200，并出现对应行。每次截图前后验证可见行全为`/e2e/facets/`；Application/Method/Host/Status/Protocol/Type总数与已生成记录一致，尚未配置规则的Rule组为0。残留外部连接造成污染时失败，不隐藏数据继续采用；不将UI的Paused称为已经暂停Core。
4. 点击`capture.filter.toggle.method`展开Method组；等待`capture.filter.option.method.GET`与`.POST`可见。按DOM顺序读取组内所有`capture.filter.option.method.*`，必须是GET、POST。
5. 在GET Capture行触发原生`contextmenu`。从该行公开exchange ID构造`capture.create-rule.<exchangeId>.block`与`.breakpoint`；等待两者可见，轮询动画结束后的bounding boxes并要求文本左缘差<1px。Hover Breakpoint automation ID，确认二级菜单的只读文本`This endpoint`可见，再按Escape关闭。
6. 显式proxy客户端发送`POST /e2e/facets/post-second`并取得origin 200；等待`capture.filter.option-count.method.POST`文本变成2，然后再次原始读取DOM顺序，仍必须是GET、POST。
7. 让origin gate暂不返回`GET /e2e/facets/pending`。等待该Capture行出现，并确认Status Pending与Content type Pending count均为1；点击Status Pending后只保留该进行中行。释放origin response并取得200，等待Pending count回0，但三个Pending option必须继续存在；取消Status筛选。
8. 计数刚刷新后立即点击`capture.clear`；等待所有`capture.request-row.*`数量变为0。随后不使用Playwright auto-retry，直接读取`capture.filter.group-count.method`原始文本并要求为0，同时直接读取GET/POST option数量并要求均为0；三个永久Pending option仍存在且count=0。
9. 附加`capture-facet-state.json`、最终截图、trace、Main/Renderer日志和metadata。fixture进入Settings→Proxy；若`settings.proxy.restore`存在则点击并等待消失，然后正常Close，验证Main/Core PID退出、8888可重新bind并删除profile。

### 预期效果

实时count只更新数字，不移动既有facet DOM；三个Pending bucket永久存在并可筛选真正进行中的request；Breakpoint submenu trigger与同组Block对齐且可展开；Clear完成时列表与facet snapshot同帧归零，不存在最多600ms的split state。

### 验收要求

- POST计数反超后仍保持GET、POST顺序；Breakpoint与Block左缘差小于1px；Clear后rows和facet同步清空。
- 三段行为及销毁、系统代理恢复均须通过。selector、UAC、构建或fixture失败不算产品故障。

<a id="capture-detail-body-fill"></a>
## `capture.detail-body-fill`

**状态**：passed
**策略**：privileged UI

### Steps

1. 为该test创建独立`userData`目录并启动仓库本地production bundle；开启BrowserContext trace，等待`app.root`、带真实PID的Core状态和`127.0.0.1:8888`可连接。
2. 若fresh profile显示Proxy readiness，先点Cancel确认没有隐式OS写入；点击`capture.recording.toggle`，在再次出现的readiness中点击`capture.readiness.enable`并完成Windows授权，等待Recording的`aria-pressed=true`。
3. 启动random-port HTTP origin；测试客户端以absolute-form URL向8888发送`POST /e2e/detail-body-fill`和200项JSON entries，保留两平台同一份原始输入。macOS的真实窗口尺寸由driver/config准备，不在workflow添加额外query或改产品CSS制造滚动。Origin返回真实JSON response body、`application/json`和固定E2E headers/cookies。
4. 等待动态`capture.request-row.<exchangeId>`出现并点击；点击`capture.inspector.tab.response`，等待按需`body.read-range`完成，确认`capture.inspector.body-view`与`capture.inspector.body-pane`都可见。
5. 同一帧读取`capture.inspector.scroll`、BodyViewer root和CodeViewer pane的`getBoundingClientRect`：pane height必须≥320px；scroll bottom减BodyViewer bottom必须为18px设计padding（容差16–20px）；BodyViewer bottom与pane bottom差绝对值<1px。
6. Windows先保留上述默认1600×900布局检查，再通过driver已持有的真实BrowserWindow把本轮窗口内容高度调整为800px并读回确认；macOS沿用现有800px专项项目。不是模拟viewport、不改产品默认尺寸、CSS或200行请求输入。点击`capture.inspector.tab.request`加载原请求，让外层Inspector停在距底部80px且鼠标位于`capture.inspector.body-pane`；先用wheel确认Monaco内部滚动，再把Monaco垂直滑块拖到底并记录外层scrollTop；继续同方向wheel 300后，外层scrollTop必须增加，证明内部边界把滚动交回外层。
7. 附加`body-viewer-geometry.json`（含两段scrollTop）、最终截图、trace、Main/Renderer日志和metadata。fixture进入Settings→Proxy；若`settings.proxy.restore`存在则点击并等待消失，然后正常Close，验证Main/Core PID退出、8888可重新bind并删除profile。

### 预期效果

Response tab只有一个Body section时，toolbar保持40px，正文pane吃满Inspector scroll扣除22px top/18px bottom padding和section header后的全部剩余高度；不能只让外层Section变高而让CodeViewer pane塌成一条线。Request tab的pane独立滚动到边界后，继续wheel必须自然驱动Inspector外层滚动。

<a id="capture-list-virtual-scroll"></a>
## `capture.list.virtual-scroll`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和HTTP origin；启动trace/Electron，等待App/Core/8888/readiness；检查列表空、selection=null、scrollTop初始。
2. 点击readiness Enable并完成授权，等待Recording；一次制造超过viewport和overscan的真实请求，等待总计数稳定。
3. 检查DOM中的request row数量远小于总记录数。
4. 滚动到中间，点击一个动态request row并记录scrollTop/selection。
5. 点击 `shell.workspace.rules`，再点击 `shell.workspace.capture`。
6. 确认selection、Inspector和scrollTop保持。
7. 在停靠底部时产生新请求，确认自动跟随；离开底部后再产生请求，确认不抢滚动位置。
8. 在Proxy点击Restore，确认非owned；保存evidence并点击Close。
9. 验证销毁、8888释放和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

TanStack Virtual只渲染有限row；大量数据下选择、滚动和跨workspace状态稳定；实时追加遵守stick-to-bottom语义。

<a id="capture-inspector-body-modes"></a>
## `capture.inspector.body-modes`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和HTTP origin；启动trace/Electron，等待App/Core/8888/readiness；检查Inspector=Headers、selection=null、MITM off。
2. 点击readiness Enable并完成授权，等待Recording；制造一条JSON response并点击其request row→Response tab。
3. 点击 `capture.inspector.body-mode.auto`，验证MIME探测和pretty JSON。
4. 点击 `capture.inspector.body-mode.text`，验证原始UTF-8文本。
5. 点击 `capture.inspector.body-mode.json`，验证显式格式化；另用非法JSON验证保留原文。
6. 点击 `capture.inspector.body-mode.hex`，逐字节比对offset、hex和ASCII。
7. 制造大 body，验证完整正文仍可查看与复制。
8. 在Proxy点击Restore，确认非owned；保存evidence并点击Close。
9. 验证销毁和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

Auto/Text/JSON/Hex语义准确；真实body range与显示一致；非法内容和preview上限不会被误报或撑破布局。

<a id="capture-protocols-without-mitm"></a>
## `capture.protocols.without-mitm`

**状态**：planned
**策略**：shared

### Steps

1. 创建fresh profile/evidence和plain HTTP/WS、secure HTTPS/WSS origins；启动trace与新Electron。
2. 等待App/Core/8888和Proxy readiness modal；确认Paused/Not recording、CA absent、MITM off；点击 `capture.readiness.enable`并完成授权，等待Recording。不得Generate CA或Start decrypting。
3. 通过8888发送HTTP POST。点击其动态request row，依次打开Headers/Request/Response/Timing/Cookies/TLS与四个body mode。
4. 建立WS，发送text `plain-text`和binary `01 02 03 04`；origin原样echo并clean close。点击handshake row→Messages，再点击四个动态frame。
5. 建立HTTPS，发送带marker header/body的请求并读完response后clean close。
6. 建立WSS，完成text/binary echo并clean close。
7. 点击两个不同port的CONNECT rows→Tunnel tab，确认Encrypted、TLS tunnel和metadata-only说明；在全UI搜索并确认HTTPS path/header/body和WSS message均不存在。
8. 点击 `capture.clear`；进入Settings Storage刷新，确认Exchange/Body=0、Session=1；进入Proxy点击Restore，确认非owned和Paused；保存evidence。
9. 点击 `shell.window.close`，验证Main/Core/Worker全退、8888释放且系统代理恢复。
10. 关闭全部origin/client并删除profile。

### 预期效果与字段矩阵

**HTTP summary/detail**

- Summary：POST、host、path+query、200、h1、json、request/response bytes、completed duration；
- Request headers：host、connection、content-type、content-length、`x-interceptor-e2e-request: http`；
- Request body：body hash可读、media type/size正确、JSON与发送值一致；
- Response headers：content-type、`x-interceptor-e2e-response: http`；Cookie不在Headers重复；
- Response body：Auto/Text/JSON/Hex与真实UTF-8字节一致；
- Cookies/Timing/TLS：两个cookies、真实TTFB/body段、plaintext且无证书链。

**WS handshake/messages**

- Summary：GET、scheme=ws、`/e2e/plain/ws`、protocol=ws、101、Connected、clean completed；
- Upgrade headers：connection、upgrade、sec-websocket-version、sec-websocket-key；
- Frames：client→server/server→client各一条text和binary，seq递增、opcode=1/2、size/timestamp正确；
- Payload：text与echo一致，binary hex=`01 02 03 04`，body range size/end正确。

**HTTPS/WSS privacy boundary**

- 客户端HTTPS得到200/JSON，WSS完成echo，证明tunnel真实可用；
- Capture各为CONNECT、scheme=https、host=localhost、对应port、protocol=tls、200、MIME=`application/x-encrypted-tunnel`；
- open/request-complete在clean close后更新为completed并有duration；
- headers为空、无request/response body ref、无path/query、无WSS Upgrade header和message；
- Inspector只显示Encrypted、TLS tunnel、No body和metadata-only说明。

<a id="capture-protocols-with-mitm"></a>
## `capture.protocols.with-mitm`

**状态**：planned
**策略**：privileged UI；headed；需要本机UAC/macOS Authorization

### Steps

1. 创建fresh profile/evidence和HTTPS/WSS/H2/gRPC origins；启动trace与新Electron。
2. 等待App/Core/8888和readiness modal；确认Capture列表为空、Paused、Listener=8888、System Proxy未owned。
3. 点击 `capture.readiness.enable`，由App真实发起平台授权；等待Recording。进入Proxy page确认Owned by Interceptor、Current configuration=8888。
4. **Fresh/MITM off基线**：发送HTTPS/WSS并clean close；点击CONNECT rows，确认只显示tunnel且无明文。
5. 选择tunnel，点击 `capture.inspector.setup-https`；确认Generate可用、Install/Start decrypting disabled；点击 `capture.https-setup.generate`。
6. **Generated/not trusted/MITM off**：确认Generated、Not installed、MITM unchecked；再次发送HTTPS/WSS，仍为CONNECT tunnel。
7. 重新打开HTTPS Setup，点击 `capture.https-setup.install`，由本机用户完成原生授权；等待Trusted/Ready，确认Start decrypting enabled但尚未点击。
8. **Trusted/MITM off**：第三次发送HTTPS/WSS，仍只显示tunnel；证明Trust不会自动启用MITM。
9. 在Certificates输入`localhost`并点击Add host；返回Setup点击 `capture.https-setup.start-decrypting`；等待MITM active/switch checked。
10. **Trusted/MITM on**：一次发送HTTPS POST、WSS text+binary、H2 GET+trailer、gRPC request+双response message；通过动态row/frame/message ID逐项验证。
11. 对比Enable前CONNECT rows和Enable后decrypted rows，确认相同secure origin的隐私边界变化。
12. 从UI关闭MITM、移除localhost例外、Uninstall CA并完成原生授权、Delete CA；进入Proxy点击Restore；确认Not generated/Not trusted/MITM off/非owned/Paused。
13. 保存evidence，点击 `shell.window.close`。
14. 验证Main/Core/Worker全退、8888释放、journal无owned、关闭origins并删除profile。

### 预期效果与字段矩阵

**阶段状态**

- Fresh：CA不存在、Trust=false、MITM=false，HTTPS/WSS均tunnel；
- Generated：公开subject/fingerprint/validUntil出现，Trust=false、MITM=false，仍tunnel；
- Trusted：Trust=true、Ready、MITM=false，仍tunnel；
- Enabled：Trust=true、MITM=true，HTTPS/WSS/H2/gRPC完整明文。

**HTTPS H1**

- Summary：secure=true、method/path/query、h1、200、json、bytes/duration；
- Request：scheme=https、`x-interceptor-e2e-request: https`、content headers和JSON body精确；
- Response：`x-interceptor-e2e-response: https`、content type、cookies、JSON body精确。

**WSS**

- Handshake：secure=true、scheme=wss、真实path/query、ws、101、Upgrade headers；
- Frames：双方向text/binary共四条，seq/opcode/size/timestamp和payload精确；
- 与同endpoint的Enable前CONNECT-only记录形成明确对比。

**HTTP/2**

- Summary：secure=true、h2、GET、完整path+query、200、json；
- Pseudo headers：request包含Core实际暴露的`:method/:path/:scheme/:authority`，response包含`:status`，均`isPseudo=true`；
- Regular headers/body：request marker、response marker/content type和JSON精确；
- Trailer：`x-interceptor-e2e-trailer: h2-complete`，kind=response-trailer。

**gRPC**

- Exchange：secure=true、h2、POST、service path、request/response MIME=`application/grpc+proto`、200；
- Request headers：content-type、`te: trailers`和h2 pseudo headers；
- Request message：recognized=true、side=request、一个envelope、compressed=false、offset/length/bytes正确；
- Response messages：两个offset递增envelope，第一compressed=false、第二compressed=true，均非truncated/malformed，payload精确；
- Trailers：grpc-status=0、grpc-message=OK；Inspector显示`gRPC 0 OK`。

**清理**

- MITM switch关闭、localhost例外移除、CA信任卸载、CA文件删除、System Proxy恢复；
- App关闭后无进程、端口、journal或profile残留。

<a id="capture-inspector-resize"></a>
## `capture.inspector.resize`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和HTTP origin；启动trace/Electron，等待App/Core/8888/readiness；检查Inspector width=500、selection=null。
2. 点击readiness Enable并完成授权，等待Recording；制造并选择一条含long URL和body的request。
3. 拖动 `capture.inspector.splitter` 到最小Inspector宽度，检查List与Inspector。
4. 拖到中间位置，再拖到最大允许位置。
5. 切换多个Inspector tab和body mode。
6. 重新选择另一条request，确认布局仍可用。
7. 检查页面无横向/纵向溢出或文字遮挡。
8. 在Proxy点击Restore，确认非owned；保存evidence并点击Close。
9. 验证销毁和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

Inspector/List遵守最小宽度；splitter拖动线性且受限；summary、tabs、headers、CodeMirror和Hex不重叠或撑破布局。

<a id="capture-clear"></a>
## `capture.clear`

**状态**：planned
**策略**：shared

### Steps

1. 创建profile/evidence和HTTP/WS origin；启动trace/Electron，等待App/Core/8888/readiness；检查Capture/Storage计数为初始空态。
2. 点击readiness Enable并完成授权，等待Recording；制造含request/response body的HTTP和含text/binary frames的WS。
3. 确认列表、Inspector、Storage counters均非零。
4. 点击 `capture.clear`。
5. 等待按钮从disabled恢复，确认列表、Inspector selection 与 facet 分栏同帧清空；所有 group count 为0，
	不得在列表已显示 `0 of 0` 时短暂残留旧 application id、选项或计数。
6. 进入Settings Storage，点击Refresh。
7. 确认Exchange/Body/WS相关数据归零，Session count保留1，RuleSet/Diagnostics未删。
8. 在Proxy点击Restore，确认非owned；保存evidence并点击Close。
9. 验证spill文件删除、Main/Core/Worker销毁、8888释放和系统代理恢复。
10. 关闭origin并删除profile。

### 预期效果

Clear是唯一删除Capture入口；它删除Exchange、Body和spill，原子重置Renderer timeline与 facet snapshot，
但保留活动Session壳，不影响Rules/Diagnostics。

<a id="capture-tools-body-export"></a>
## `capture.tools.body-export`

**状态**：passed
**策略**：native-ui；Windows；两代真实Electron；host-safety-guard

### Steps

1. 独立profile启动真实Electron，使用正式Settings配置本地Provider和MCP Client；保留应用当前语言。
	Agent与MCP discovery必须披露`capture_export_body`，不通过Store或内部API注入状态。
2. 经真实UI开启Recording，通过测试拥有的origin/client产生可核验的正文；通过正式Capture查询取得
	Exchange与Body身份。数据包含超过预览上限的正文及需要按原始存储字节保存的正文，不预造导入文件。
3. Agent Ask请求保存正文，先Deny，确认没有Save Dialog或文件任务；再次请求并Allow，在真实原生Dialog
	点击Cancel，确认`started: false`且不伪造job。审批只显示可信身份和元数据，不显示完整URL、正文或路径。
4. 再次Allow并在真实Save Dialog选择测试拥有的目标，取得安全任务摘要；用正式任务查询确认completed，
	只读核对导出文件的长度/hash与真实网络正文一致，不能只校验有限预览或认为任务启动即完成。
5. MCP Auto执行同一Tool仍须弹出真实Save Dialog；验证原生取消及成功保存，Agent/MCP返回均无本地文件
	信息。错配的已知Exchange/Body，以及Clear后的旧身份，不得打开Dialog或创建导出任务。
6. 分别关闭Agent与MCP的Body导出开关，旧Chat/连接不可继续调用；一列撤权不改变另一列。
	原有Capture正文保存入口仍能使用同一正式保存逻辑，不新增测试后门或绕过原生Dialog。
7. 正常关闭后同profile重启，授权保持；Model、origin和文件任务增量为0，旧任务身份不重放。
8. 保存脱敏trace、文件长度/hash、摘要与两代metadata；经产品Close验证Main/Core/Worker全部退出、8888
	释放、完整WinINet与共享journal恢复，再删除本workflow拥有的输出文件与profile。

### 预期与证据

Tool只能导出当前Exchange实际拥有的正文，路径仅由用户在原生Dialog决定。文件数据走Core流式保存，不进入
Renderer或Tool上下文；大正文与编码正文必须以真实文件字节作为证据。审批、执行、Clear竞态与取消边界由
owning unit/integration覆盖，真实Electron锁定用户流程；原生焦点、fixture迁移或构建问题不作为产品Red。

当前正文导出边界见[Transfer契约](../../../../../architecture/features/transfer.md#34-capture-body导出tool)。
本组不覆盖已启动导出与Clear的lease/snapshot和Cancel/rename提交点债务。

<a id="capture-tools-transfer-jobs"></a>
## `capture.tools.transfer-jobs`

**状态**：既有运行中取消与窗口退出passed；新增公开路由隔离、UI Cancel→Clear→重新录制和English检查点已通过，来源`2026-10-21T18-51-41-246Z-vWvRUk`；取消提交点竞态未验
**策略**：native-ui；保留Windows基线，macOS新增检查点已验；两代真实Electron；host-safety-guard

### Steps

1. 独立profile启动真实Electron，通过Settings创建本地Provider和MCP Client，Ask Chat discovery必须披露
	文件任务Get/Cancel两项；业务状态不注入。由产品Diagnostics Export经真实Save生成一个独立已完成任务，
	其jobId来自正式Tool结果而不是猜测。
2. Agent静默查询已完成任务，确认身份、种类、计数和终态，结果不含文件名/路径/message/warnings内容。
	对同一任务执行Ask Deny、Allow及Auto取消，验证完成任务状态不变；未知身份返回job:null，不重放文件操作。
3. 开启真实录制，通过Settings → Proxy → Restore恢复原系统路由，正常Clear本profile临时录制后，只让显式客户端向8888发送本轮流量，不用固定Keyword掩盖全量归档内容。用本地origin发送较大的非压缩响应，等待Capture记录完整；从产品Capture Export菜单
	选择Archive并经真实Save启动文件任务。进度组件公开真实jobId/state/processed/total，不能从Store读取或seed。
4. 当前Archive仍running时，MCP Get返回同一jobId及进度；通过真实Ask批准`capture_clear`，Core必须拒绝，原Capture行身份与导出running状态保持。保存`capture-clear-during-transfer.json/png`及trace，不用任务已经完成后的Clear代替这一断言。随后MCP Cancel先Deny，再Allow取消。关闭进度弹窗后
	通过UI把MCP切到Auto并启动第二个Archive，再取消第二个运行中任务。两轮确认Core状态cancelled、UI一致，
	输出文件不存在、临时文件已清理，其他已完成任务不变。
	测试不能把已完成任务取消当作本步通过，不向产品新增测试专用延迟或暂停入口。
	在最终运行中退出验证前，再从产品UI启动Archive，确认公开进度仍为running后真实点击进度中的Cancel。等待Core/UI终态与输出、临时文件清理完成，随后才从Capture Clear清理本轮记录；这不是原生Save窗口取消，也不能在清理未完成时绕过Clear限制。
5. 通过Settings分别撤销两项Agent/MCP权限，旧Chat/连接均不可再调用；MCP独立权限不因Agent撤权被关闭。
	操作中保持应用语言，使用公共automation ID、状态属性与测试自产标识进行断言。
6. UI Cancel与Clear后，通过同一真实origin和显式8888客户端重新产生128 MiB捕获数据，不能复用已清空的记录或预造正文文件。关闭Agent面板后，再通过Capture菜单和原生Save启动Archive，保留原运行中退出验证。保存公开进度、截图并确认任务仍为running；Windows因进度遮罩覆盖自绘窗口按钮，核验测试Main的PID、启动代际和前台窗口后使用真实Alt+F4，不先点Transfer Cancel。macOS沿原workflow的真实窗口退出分派，不能用强杀或隐藏接口替代。退出完成时输出和临时文件必须清理，已完成Diagnostics文件不变，Main/Core/Archive Worker全部退出。
7. 同profile重启，授权设置保留；已完成任务与退出时运行中的旧代际jobId均查询为null，无Model/origin/文件任务重放。
	先验证两代Main/Core/Archive Worker销毁、8888释放及完整WinINet/journal恢复，再删除产品输出与profile。保存两代trace/metadata及运行中关闭前的公开进度；竞态确定性由Transfer/Core关闭unit覆盖，不把当前复验补称为历史前置Red。

### 预期与证据

Core的进度、运行中取消及终态幂等由unit/integration与同一真实流程交叉验证；取消必须触发真实文件任务的
AbortSignal并清理I/O，而不是仅将界面改为cancelled。保存各阶段安全job快照、文件hash/存在性、恢复与进程代际，
不归档敏感文件名、完整原始正文或认证数据。原生窗口焦点、任务完成太快或selector失败不作为产品Red。

取消提交点续作：Cancel返回的是Core确认的实际结果，只有操作中止并完成清理才返回cancelled；如果保存或导入已经提交，应返回completed并保留成功文件/数据及通知。确定性的fsync/rename时序由所属unit/integration覆盖，不为真实E2E注入暂停或故障分支；原运行中取消与重启workflow先确认当前基线，再于修复后同样复跑。

<a id="capture-tools-har-transfer"></a>
## `capture.tools.har-transfer`

**状态**：既有HAR警示、真实Save/Open、Agent/MCP与双代恢复验收保留；新增同次GUI `ui.har` 四条导出→追加到八条及完整正文检查点已通过，来源`2026-10-21T19-01-48-619Z-tbNOPz`。旧`complete.har`来源继续保留，不将其冒充新的同文件回导。
**策略**：native-ui；Windows/macOS；两代真实Electron；host-safety-guard

### Steps

1. 独立profile与trace启动真实Electron，经Settings配置本地Provider和MCP Client，保持应用语言；
	通过正式discovery确认`capture_export_har`和`capture_import_har`可见。
2. UI开始Recording，通过真实origin/client产生两条可区分HTTP记录，含文本/二进制正文、Authorization
	和Cookie；身份来自正式Capture查询。真实Keyword限定`/e2e/har-tools/`，非必要facet通过公共toggle折叠。记录产品自产字节与计数，不写HAR业务输入或注入Store。
3. Agent Ask Export先Deny，再Allow后原生Cancel，确认无文件/任务；随后Allow在Save Dialog选定目标，
	等正式任务completed，只读核对HAR 1.2、范围、最终headers与完整正文，Tool只返回安全任务摘要。
4. Agent Auto Export仍经Save；覆盖filter/selected范围、遮罩Authorization/Cookie与strip bodies，
	对照同workflow真实流量验证输出，不用空结果冒充筛选成功。
5. Agent Ask Import先Deny，再Allow后原生Cancel；通过真实Recording按钮暂停并确认`aria-pressed=false`，避免背景流量混入后续all范围。通过产品Clear清空后，从Open Dialog选择步骤3生成
	的HAR，等待import completed并验证Capture恢复可表达的记录与正文。导入本身不隐式Clear或覆盖已有数据。
6. MCP Auto分别执行Export/Import，仍经真实Save/Open，选择同workflow产品生成的HAR，验证追加与安全结果。
	关闭两项Agent权限不影响MCP，随后关闭MCP权限使旧连接不可发现/执行，两列均保持独立。
	Capture菜单的原IPC导出入口先核对菜单`display: flex`及`align-items: center`、`.har`扩展名与9.5px字号，再核对限制警示可见、12px文字、11px/13px内边距和非透明背景，随后执行既有导出/导入断言。
	- 原UI All导出核对四条；Keyword缩小到`/e2e/har-tools/text`后选择一条并打开Response，Filter/Selected分别核对两条/一条产品HAR文件。菜单、范围和默认遮罩/正文选项在真实UI断言之后截图。
	- 保留Privacy默认切换及override/plain/stripped三次原导出，分别验证Authorization、Cookie与正文checkbox和实际文件，单次覆盖不能改变全局默认或旧文件；恢复三个全局默认后再执行原UI Import。
	- 原生Save完成后保留原Close行为，检查HAR、弹窗消失及Export入口可用，再拍返回Capture的状态；不把开始导出当成完成，不为截图添加停留或改变任务速度。最后UI Import必须选择同次GUI All导出的`ui.har`（4条），不能使用早先Agent导出的`complete.har`（2条）。导入前仍是原4条，追加后为8条，原四个公开身份全部保留、另四个身份新增，`ui.har`的hash不变。
	- 对新增四条记录逐条经UI检查：Request均为16字节`HAR request body`；其中两条text Response为17字节`HAR response body`，两条binary Response为`00 01 7f 80 fe ff`六字节。Request/Text Response通过真实Copy核对，Binary通过实际Hex显示及Copy dump核对；各取一条text/binary的Request与Response画面，明确两侧格式，不把binary响应写成binary请求。保留原入口、原生选择后八条列表、完整正文、权限与两代退出断言。
7. 同profile正常关闭并重启，确认授权保持，Model/origin/文件操作无重放；旧代际任务查询为null。
8. 保存脱敏trace、文件hash与安全统计、两代metadata；产品Close后验证Main/Core/Worker全退、8888释放、
	完整系统代理与共享journal恢复，再删除本workflow拥有的`har-transfer-files`输出/profile。首次失败产物保留，不用强制清理冒充Green。

### 预期与证据

标准HAR文件只能由产品真实Export产生再Import，Core执行正式格式映射及隔离Session追加；Tool不操作路径或
读取文件内容。任务摘要不宣称开始即完成；范围、脱敏和正文完整性分别以输出文件和实际Capture结果交叉证明。
损坏HAR、流式内存及提交点竞态不在本workflow造故障验收。

English截图复验记录：

- `2026-10-21T13-24-29-192Z-q56kfT`在UI All计数断言失败：按钮文本是`All traffic4`，`\b4\b`不能匹配连写文本。这是selector失败，不是产品Red；12张失败图不采用。All/Filter/Selected统一改读公共范围按钮末尾的独立计数`span`，用`toHaveText('4'/'2'/'1')`精确比较，不能误接受`14`。
- 同次`437380ms`包含原`420000ms`预算与`17380ms`截图开销。原生Save/Open及业务已在`13:26:14Z`推进到UI Export；计数断言失败后进入原先停trace的清理区间，直到`13:32:08Z`才恢复trace。`closeGeneration()`此前没有处理失败后留存的HAR弹窗，却先点击其遮罩后的Settings；现在先通过真实Cancel/Close移除该弹窗，再转Settings和正常退出，不增加timeout。
- 中间敏感区间未录BrowserContext trace，不能把整段空窗称为单个原生Dialog或网络请求的测量耗时。保留原输入、文件/隐私断言、双代恢复与失败错误传播；修正后的原HAR流程及最新同文件回导已由上述完整来源验证，历史失败不采用。

<a id="capture-transfer-har-roundtrip"></a>
## `capture.transfer.har-roundtrip`

**状态**：planned
**策略**：native-ui + os-side-effect

### Steps

1. 创建profile/evidence、HTTP origin和预定输出目录；启动trace/Electron，等待App/Core/8888/readiness；只检查Privacy的HAR默认值和Capture空态。
2. 点击readiness Enable并完成授权，等待Recording；制造含Authorization、Cookie、query、request/response headers及文本/二进制body的多条真实Capture，记录可由HAR表达的基线字段。
3. 点击 `capture.export-menu`→`capture.transfer.har-export`；依次检查all/filter/selected scope计数，选择All并保留body且不遮罩，使用真实Save Dialog导出round-trip HAR。
4. 等待completed；外部只读解析HAR 1.2，确认entries、timings、headers、query、cookies、文本与base64 body对应基线，且Renderer未获得绝对路径。
5. 再次由UI导出一份开启Authorization/Cookie遮罩和strip bodies的HAR，外部只读验证脱敏输出与原文件不同且无敏感值/body。
6. 通过 `capture.clear` 的真实确认框清空Capture；进入Storage Refresh确认Exchange/Body归零。
7. 点击 `capture.import-menu`→`capture.transfer.har-import`，在真实Open Dialog选择步骤3由本workflow导出的HAR；点击Start并等待completed。
8. 在App逐条选择导入记录，将method/URL/status/headers/query/cookies/body与步骤2基线对比；只要求HAR可表达字段等价，并确认脚本文本保持inert。
9. 复制并破坏导出HAR后再次Import，确认failed且当前已恢复列表不变；进入Proxy点击Restore，确认非owned；保存evidence并Close。
10. 验证销毁和系统代理恢复；删除两份HAR及损坏副本，关闭origin并删除profile。

### 预期效果

HAR输入由同一workflow的真实Capture生成；标准HAR可解析，Clear后能通过UI安全导回且可表达字段等价；脱敏/strip语义准确；损坏输入事务性回滚；不把HAR本来无法承载的Interceptor专有字段误当作全保真要求。

<a id="capture-transfer-archive-roundtrip"></a>
## `capture.transfer.archive-roundtrip`

**状态**：planned
**策略**：native-ui + privileged UI

### Steps

1. 创建profile/evidence、HTTPS/H2/WS origins和输出目录；启动trace/Electron，等待App/Core/8888/readiness；只检查Capture空态、CA absent、MITM off和Proxy未owned。
2. 点击readiness Enable并完成授权，等待Recording；从App UI Generate/Install CA、添加localhost例外并Start decrypting。
3. 制造含HTTPS/H2 pseudo headers、trailers、文本/二进制body和WS frames的真实Capture；逐项记录列表、Inspector及frame基线。
4. 点击 `capture.export-menu`→`capture.transfer.archive-save`；在真实Save Dialog选择`.iarchive`并Start，等待completed；外部只读检查ZIP manifest、snapshot、body entries、size/hash/CRC。
5. 通过 `capture.clear` 的真实确认框清空Capture，确认列表/Inspector为空；点击 `capture.import-menu`→`capture.transfer.archive-open`，在真实Open Dialog选择步骤4由本workflow保存的archive。
6. 点击Start并等待completed；在App逐条选择恢复记录，对比协议、pseudo headers、trailers、headers、timings、文本/二进制body、WS帧方向/顺序/payload及Session元数据，要求全保真等价。
7. 复制并篡改同一archive的hash/CRC或加入路径穿越entry，再次Open；确认failed、错误有界、当前已恢复Capture不污染且Worker进入终态。
8. 在App确认任务状态未暴露绝对路径；从UI关闭MITM、移除localhost例外、Uninstall/Delete CA并在Proxy Restore。
9. 保存evidence并Close；验证App/Core/Worker/8888销毁、系统代理恢复且信任库无测试CA残留。
10. 删除archive及损坏副本，关闭origins并删除profile。

### 预期效果

Archive输入由同一workflow的真实Capture生成；保存文件结构自洽，Clear后通过UI打开可全保真恢复Interceptor专有数据；损坏或恶意ZIP被拒绝并回滚；所有系统副作用在结束前恢复。
