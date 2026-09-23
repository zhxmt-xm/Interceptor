# 功能想法与问题

本表保留目标、问题依据和方案约束。任务状态与验收安排见<a href="../HANDOVER.md">Handover</a>。

<div style="overflow-x: auto;">
<table style="width: 1230px; min-width: 1230px;">
<colgroup>
  <col style="width: 230px;">
  <col style="width: 400px;">
  <col style="width: 280px;">
  <col style="width: 320px;">
</colgroup>
<thead>
<tr><th>Name</th><th>Description</th><th>Problem</th><th>Approach</th></tr>
</thead>
<tbody>

<tr>
  <td>Agent / MCP shared Tool capabilities</td>
  <td><ul>
    <li>内置Agent与外部MCP共享产品Tool目录，由用户分别控制入口授权与change执行方式。</li>
    <li>Updates保留产品入口，不提供Tool；完整名称和业务契约见<a href="../features/tool-capabilities.md">Tool capabilities</a>。</li>
  </ul></td>
  <td><ul><li>不同入口各自维护目录、参数和业务步骤会产生授权及执行差异；Settings开关不能代替业务入口本身。</li></ul></td>
  <td><ul>
    <li>Agent与MCP共用<code>packages/interceptor-tools/</code>中的descriptor、schema、executor和redactor，执行进入同一Main/Core业务方法。</li>
    <li>open-world网络Tool必须先经Ask/Auto，再沿Core RPC AbortSignal关闭真实socket；结果统一经过共享redactor。</li>
    <li>共享业务契约与transport协议分开，不为旧Host增加legacy Tool别名或复制执行逻辑。</li>
  </ul></td>
</tr>

<tr>
  <td>Desktop application attribution</td>
  <td><ul><li>Douyu等桌面应用的request被显示为Edge，需要区分真实发起进程与应用归属。</li><li><img src="image-6.png" alt="Application attribution" width="240"></li></ul></td>
  <td><ul><li>仅凭截图不能确定是共享网络进程、端口快照还是父进程归属导致。</li></ul></td>
  <td><ul><li>复现时关联request socket、PID、可执行路径与client identity匹配链，不根据显示名猜测owner。</li></ul></td>
</tr>

<tr>
  <td>Duplicate application identities</td>
  <td><ul><li>Capture filter中出现看似相同的Application，需要区分重复记录与不同应用的同名显示。</li><li><img src="image-7.png" alt="Duplicate application" width="240"></li></ul></td>
  <td><ul><li>identity key重复、显示名碰撞和facet snapshot重复是不同原因，截图不能区分。</li></ul></td>
  <td><ul><li>关联真实id/path与facet输入再定义去重契约，不按显示名盲目合并。</li></ul></td>
</tr>

</tbody>
</table>
</div>
