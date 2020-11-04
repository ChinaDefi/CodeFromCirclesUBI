# CodeFromCirclesUBI
The key network request code for circlesUBI



## 附录：CirclesUBI业务逻辑资料

由于官方文档比较少，理清楚CirclesUBI的现状有两个线索，一个是界面跳转关系，一个是数据请求顺序

## 界面跳转关系

**资料来源**： circles.garden网站

circles.garden的服务器超负荷运行，出现了很多的问题，最高时circles.garden服务器峰值遭遇了7000万次请求

来自：https://github.com/CirclesUBI/circles-myxogastria issues

<img src="/Users/hwb/Desktop/%25E6%2588%25AA%25E5%25B1%258F2020-10-21%2520%25E4%25B8%258B%25E5%258D%25884.14.28.png" alt="截屏2020-10-21 下午4.14.28" style="zoom:50%;" />

因为服务器过载，处于流程不能跑通的状态，所以我们只能通过历史记录，总结一份跳转顺序，出一个流程列表



### 注册登陆元素

- welcome https://circles.garden/welcome

  - 注册流程

    - Sign up https://circles.garden/welcome/onboarding

    - Username 

      > 使用的后台链接 https://api.circles.garden/api/users/

    - email

    - 显示助记词

    - 验证助记词

  - log in  https://circles.garden/welcome/login

    - 输入助记词

    

### 主界面元素

- 首页 https://circles.garden/
  - 头像 + 自社区账号成功起获得的Circles 数量
  - 搜索
  - 已经trust的用户
    - 用户详情 https://circles.garden/profile/0xD2d0A1f605cB3fB294c4949f857c4Ce9d233Ed97
      - activity
      - Trusted by

* 头像(个人信息) https://circles.garden/profile
  * Show Profile
  * Show QR Code

* My QRcode https://circles.garden/share
  * 二维码
  * Share按钮 
    * Hey! Check out my Circles UBI profile! https://circles.garden/profile/0x60bA60707F7fdC5FD0373daeEF53cBFe89C35908
* Activity Log https://circles.garden/activities 
  * Transations  (转账记录)
  * connections （连接记录）
* Send Circles https://circles.garden/send
  *   direct trust https://circles.garden/send?query=&filter=direct
  *   In your network https://circles.garden/send?query=&filter=indirect
  *   External https://circles.garden/send?query=&filter=external
  *   其他
      * 搜索
      * 扫描二维码
* Settings https://circles.garden/settings
  * status
    * Device address
    * Profile address
    * Token address
  * End Session
* Export Seed Phrase https://circles.garden/seedphrase



## 数据请求顺序

**资料来源：**

- 智能合约代码： https://github.com/CirclesUBI/circles-contracts

- 核心业务逻辑代码：https://github.com/CirclesUBI/circles-core

  

**相关的API接口**

智能合约业务链条包括：HUB、PROXY_FACTORY、SAFE、SAFE_FUNDER

中心化服务器：

- apiServiceEndpoint: 'https://api.circles.garden/api.',

  > 非链上数据的通信节点

- graphNodeEndpoint: 'https://graph.circles.garden/subgraphs/name/CirclesUBI/circles-subgraph.',

  > 向The graph查询状态的服务器节点

- relayServiceEndpoint: 'http://relay.circles.garden.'

  >  与智能合约通信的中转服务器节点



为了看起来方便，汇总了几个关键流程的代码，包括账户创建、检查信任状态、修改信任状态、转账。放在了这个代码库：https://github.com/ChinaDefi/CodeFromCirclesUBI



