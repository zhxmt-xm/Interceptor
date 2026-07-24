## Todo list

### Capture
1. ✅ rule的popup实现不对，尽量用antd来做并更新设计稿，还有如果add condition和add action没用antd实现也可以尽量改用antd，但是和capture filtering一样尽量一比一还原设计稿，微小间距可以按antd更新设计稿   ![alt text](image.png)
2. ✅ equals这个dropdown可以去掉，改为后面的input上加几个button，比如是否忽略大小写，是否精确匹配相等（默认是contains），是否是regex，或者你有什么更好的可以补充
3. ✅ rule的apply button要严格检查所有rules的内容是否严格相等，比如我从123改成了1234，但后来又改回来了，这个时候不应该没有检查还允许apply
4. ✅ add condition按钮和add action按钮离上面一个元素的距离，应该和match、actions这些title距离下面元素的距离相同 ![alt text](image-1.png)
5. 设计稿的action和现在的行为不一样，你看看哪边比较合理？并且code里现在没有map local和remote的互斥，这些功能你要考虑下哪些是互斥的，要记得互斥 ![alt text](image-2.png)
6. status这个matcher可以去掉，感觉意义不大，你觉得呢？还有mime我也感觉没什么使用场景，还有host、path、query这些感觉跟URL可以合并？有必要分这么多吗你分析下