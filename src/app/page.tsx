import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">R</span>
            </div>
            <span className="font-semibold text-lg">Reimbursement Portal</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-gray-600 hover:text-gray-900 transition"
            >
              登录
            </Link>
            <Link
              href="/register"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              注册
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            智能报销，从此简单
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            AI 驱动的企业报销管理平台，自动收集票据、智能审批、一键打款
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/register"
              className="bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-blue-700 transition"
            >
              免费试用
            </Link>
            <Link
              href="/demo"
              className="border border-gray-300 text-gray-700 px-8 py-3 rounded-lg text-lg font-medium hover:bg-gray-50 transition"
            >
              查看演示
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="mt-24 grid md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">智能票据识别</h3>
            <p className="text-gray-600">
              AI 自动识别发票信息，支持机票、酒店、餐饮等多种票据类型
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">自动合规检查</h3>
            <p className="text-gray-600">
              实时检查费用是否符合公司政策，提前预警超标风险
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">一键打款</h3>
            <p className="text-gray-600">
              审批通过后自动发起打款，资金秒到账
            </p>
          </div>
        </div>

        {/* AI Features */}
        <div className="mt-24">
          <h2 className="text-3xl font-bold text-center mb-12">AI 智能助手</h2>
          <div className="bg-white rounded-2xl shadow-lg border p-8">
            <div className="flex flex-col md:flex-row gap-8">
              <div className="flex-1">
                <div className="bg-gray-100 rounded-lg p-4 mb-4">
                  <p className="text-gray-600 text-sm mb-2">你可以这样说：</p>
                  <p className="font-medium">"我刚从上海出差回来，帮我整理报销"</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-600">
                  <p className="text-gray-600 text-sm mb-2">AI 助手回复：</p>
                  <p className="text-gray-800">
                    我来帮你整理上海出差的报销。已从邮箱找到机票确认和酒店订单，
                    共发现 4 笔费用，总计 ¥3,895。缺少 1/16 晚餐票据，需要补充吗？
                  </p>
                </div>
              </div>
              <div className="flex-1 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 text-sm">1</span>
                  </div>
                  <div>
                    <h4 className="font-medium">自动收集邮件</h4>
                    <p className="text-sm text-gray-600">扫描邮箱提取机票、酒店预订确认</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 text-sm">2</span>
                  </div>
                  <div>
                    <h4 className="font-medium">识别日历行程</h4>
                    <p className="text-sm text-gray-600">从日历事件自动识别出差安排</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 text-sm">3</span>
                  </div>
                  <div>
                    <h4 className="font-medium">智能提醒补充</h4>
                    <p className="text-sm text-gray-600">检查材料完整性，提示缺失票据</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-24 py-8">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>© 2024 Reimbursement Portal. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
