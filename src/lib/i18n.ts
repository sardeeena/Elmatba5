import type { Locale } from './types';

export interface Dictionary {
  brandName: string;
  brandArabic: string;
  tagline: string;
  nav: {
    product: string;
    seo: string;
    geo: string;
    pricing: string;
    about: string;
    login: string;
    startCooking: string;
    dashboard: string;
  };
  hero: {
    kicker: string;
    headline: string;
    subhead: string;
    primaryCta: string;
    secondaryCta: string;
    egyptBadge: string;
  };
  sections: {
    kitchenTitle: string;
    kitchenSub: string;
    marketsTitle: string;
    marketsSub: string;
    pricingTitle: string;
    pricingSub: string;
  };
  auth: {
    loginTitle: string;
    loginSub: string;
    registerTitle: string;
    registerSub: string;
    forgotTitle: string;
    forgotSub: string;
    recoveryTitle: string;
    recoverySub: string;
    email: string;
    password: string;
    newPassword: string;
    fullName: string;
    signIn: string;
    createAccount: string;
    sendResetLink: string;
    updatePassword: string;
    forgotPasswordLink: string;
    backToLogin: string;
    switchToRegister: string;
    switchToLogin: string;
    confirmEmailNotice: string;
    resetSentNotice: string;
    passwordUpdatedNotice: string;
  };
  onboarding: {
    title: string;
    subtitle: string;
    stepOrg: string;
    stepProject: string;
    stepMarkets: string;
    stepReady: string;
    orgName: string;
    businessType: string;
    billingCountry: string;
    projectName: string;
    websiteUrl: string;
    industry: string;
    description: string;
    goals: string;
    addMarket: string;
    competitors: string;
    finish: string;
    next: string;
    back: string;
  };
  app: {
    overview: string;
    projects: string;
    markets: string;
    keywords: string;
    ranks: string;
    competitors: string;
    audit: string;
    geo: string;
    aeo: string;
    content: string;
    agents: string;
    reports: string;
    integrations: string;
    team: string;
    billing: string;
    settings: string;
    logout: string;
    newProject: string;
    noProjectsTitle: string;
    noProjectsBody: string;
  };
}

export const DICT: Record<Locale, Dictionary> = {
  en: {
    brandName: 'EL MATBA5',
    brandArabic: 'المطبخ',
    tagline: 'WE COOK UP GROWTH.',
    nav: {
      product: 'Product',
      seo: 'SEO & Audit',
      geo: 'GEO & AEO',
      pricing: 'Pricing',
      about: 'About',
      login: 'Log in',
      startCooking: 'Start Cooking',
      dashboard: 'Open Kitchen',
    },
    hero: {
      kicker: 'Built in Cairo · Engineered for Global Search',
      headline: 'The digital marketing intelligence kitchen.',
      subhead:
        'Bring your websites, keywords, competitors, and content into EL MATBA5. We combine multi-market search data, technical crawls, AI visibility, and specialized marketing agents to turn raw ingredients into measurable growth.',
      primaryCta: 'Start Cooking Free',
      secondaryCta: 'Explore the Menu',
      egyptBadge: 'Manage Egypt, MENA, Europe & Russia from one workspace',
    },
    sections: {
      kitchenTitle: 'Everything needed to cook organic growth.',
      kitchenSub:
        'Eight integrated disciplines under one roof—without fabricated metrics or black-box gimmicks.',
      marketsTitle: 'Local Billing. Global Search Targets.',
      marketsSub:
        'An agency in Cairo can track Arabic Google in Egypt, German Google in Berlin, and Russian Yandex in Moscow—each routed to its verified provider.',
      pricingTitle: 'Honest plans built for consultants, teams, and agencies.',
      pricingSub:
        'Transparent project, keyword, crawl, and AI credit allowances in EGP or USD.',
    },
    auth: {
      loginTitle: 'Step back into EL MATBA5',
      loginSub: 'Sign in with Supabase Auth to access your organizations and live client projects.',
      registerTitle: 'Open your growth kitchen',
      registerSub: 'Create your account in seconds. No credit card required.',
      forgotTitle: 'Recover your kitchen access',
      forgotSub: 'Enter your work email and we will send a secure password recovery link.',
      recoveryTitle: 'Set your new password',
      recoverySub: 'Choose a strong password of at least 8 characters for your account.',
      email: 'Work Email',
      password: 'Password',
      newPassword: 'New Password',
      fullName: 'Full Name',
      signIn: 'Sign In',
      createAccount: 'Create Account',
      sendResetLink: 'Send Recovery Link',
      updatePassword: 'Save New Password',
      forgotPasswordLink: 'Forgot password?',
      backToLogin: 'Back to Sign In',
      switchToRegister: 'New to EL MATBA5? Create an account',
      switchToLogin: 'Already have a kitchen? Log in',
      confirmEmailNotice:
        'Account created! Please check your email inbox and click the confirmation link before signing in.',
      resetSentNotice:
        'If an account exists for that email address, a password recovery link has been sent.',
      passwordUpdatedNotice: 'Your password has been updated. Opening your workspace...',
    },
    onboarding: {
      title: 'Set up your EL MATBA5 kitchen',
      subtitle: 'Configure your organization, first website, and international search markets.',
      stepOrg: '1. Organization',
      stepProject: '2. Project',
      stepMarkets: '3. Target Markets',
      stepReady: '4. Competitors & Launch',
      orgName: 'Organization / Agency Name',
      businessType: 'Business Type',
      billingCountry: 'Billing Country',
      projectName: 'First Project Name',
      websiteUrl: 'Website URL',
      industry: 'Industry',
      description: 'Business Description',
      goals: 'Primary Growth Goal',
      addMarket: 'Add Market Target',
      competitors: 'Competitor Domains',
      finish: 'Launch My Kitchen',
      next: 'Continue',
      back: 'Back',
    },
    app: {
      overview: 'Overview',
      projects: 'Projects',
      markets: 'Market Registry',
      keywords: 'Keyword Research',
      ranks: 'Rank Tracking',
      competitors: 'Competitors',
      audit: 'Technical Audit',
      geo: 'GEO Visibility',
      aeo: 'AEO Opportunities',
      content: 'Content Studio',
      agents: 'AI Agents',
      reports: 'Reports',
      integrations: 'Integrations',
      team: 'Team & Roles',
      billing: 'Billing & Usage',
      settings: 'Settings & GDPR',
      logout: 'Log out',
      newProject: 'New Project',
      noProjectsTitle: 'No projects cooked up yet',
      noProjectsBody:
        'Create your first project with independent target countries, languages, and search engines.',
    },
  },
  ar: {
    brandName: 'EL MATBA5',
    brandArabic: 'المطبخ',
    tagline: 'بنطبخ نمو حقيقي.',
    nav: {
      product: 'المنتج',
      seo: 'السيو والفحص',
      geo: 'GEO و AEO',
      pricing: 'الأسعار',
      about: 'عن المطبخ',
      login: 'تسجيل الدخول',
      startCooking: 'ابدأ الطبخ',
      dashboard: 'دخول المطبخ',
    },
    hero: {
      kicker: 'صُنع في القاهرة · مُصمم للأسواق العالمية',
      headline: 'مطبخ ذكاء التسويق الرقمي.',
      subhead:
        'أحضر موقعك، كلماتك المفتاحية، منافسيك، ومحتواك إلى المطبخ. نجمع بيانات البحث متعددة الأسواق، الفحص التقني، الظهور في محركات الذكاء الاصطناعي، ووكلاء التسويق لتحويل المكونات الخام إلى نمو قابل للقياس.',
      primaryCta: 'ابدأ مجاناً الآن',
      secondaryCta: 'استكشف الإمكانيات',
      egyptBadge: 'أدر مشاريع مصر والخليج وأوروبا وروسيا من مكان واحد',
    },
    sections: {
      kitchenTitle: 'كل أدوات نمو البحث في مطبخ واحد.',
      kitchenSub:
        'ثمانية مسارات متكاملة مبنية على بيانات موثقة—بدون أرقام وهمية أو وعود مبالغ فيها.',
      marketsTitle: 'فوترة محلية. واستهداف عالمي.',
      marketsSub:
        'يمكن لوكالة في القاهرة إدارة Google مصر بالعربية، وGoogle ألمانيا بالألمانية، وYandex روسيا بالروسية—مع ربط كل سوق بالمزود الدقيق.',
      pricingTitle: 'باقات واضحة للمستشارين والفرق والوكالات.',
      pricingSub: 'حصص شفافة للمشاريع والكلمات والفحص ورصيد الذكاء الاصطناعي بالجنيه المصري أو الدولار.',
    },
    auth: {
      loginTitle: 'ارجع إلى المطبخ',
      loginSub: 'سجّل الدخول عبر Supabase Auth للوصول إلى مؤسساتك ومشاريع العملاء.',
      registerTitle: 'افتح مطبخ النمو الخاص بك',
      registerSub: 'أنشئ حسابك في ثوانٍ بدون بطاقة ائتمان.',
      forgotTitle: 'استعادة الدخول إلى المطبخ',
      forgotSub: 'أدخل بريدك الإلكتروني وسنرسل لك رابط استعادة كلمة المرور.',
      recoveryTitle: 'تعيين كلمة مرور جديدة',
      recoverySub: 'اختر كلمة مرور قوية لا تقل عن 8 أحرف لحسابك.',
      email: 'البريد الإلكتروني للعمل',
      password: 'كلمة المرور',
      newPassword: 'كلمة المرور الجديدة',
      fullName: 'الاسم الكامل',
      signIn: 'تسجيل الدخول',
      createAccount: 'إنشاء حساب',
      sendResetLink: 'إرسال رابط الاستعادة',
      updatePassword: 'حفظ كلمة المرور الجديدة',
      forgotPasswordLink: 'نسيت كلمة المرور؟',
      backToLogin: 'العودة لتسجيل الدخول',
      switchToRegister: 'جديد في المطبخ؟ أنشئ حساباً',
      switchToLogin: 'لديك حساب بالفعل؟ سجّل الدخول',
      confirmEmailNotice:
        'تم إنشاء الحساب! يرجى التحقق من بريدك الإلكتروني والنقر على رابط التفعيل قبل تسجيل الدخول.',
      resetSentNotice:
        'إذا كان هناك حساب مرتبط بهذا البريد، فقد تم إرسال رابط استعادة كلمة المرور.',
      passwordUpdatedNotice: 'تم تحديث كلمة المرور بنجاح. جاري فتح مساحة العمل...',
    },
    onboarding: {
      title: 'جهّز مطبخ EL MATBA5',
      subtitle: 'اضبط مؤسستك، موقعك الأول، والأسواق الدولية المستهدفة.',
      stepOrg: '١. المؤسسة',
      stepProject: '٢. المشروع',
      stepMarkets: '٣. الأسواق المستهدفة',
      stepReady: '٤. المنافسون والانطلاق',
      orgName: 'اسم الوكالة أو الشركة',
      businessType: 'نوع النشاط',
      billingCountry: 'دولة الفوترة',
      projectName: 'اسم المشروع الأول',
      websiteUrl: 'رابط الموقع',
      industry: 'المجال',
      description: 'وصف النشاط',
      goals: 'هدف النمو الرئيسي',
      addMarket: 'إضافة سوق مستهدف',
      competitors: 'نطاقات المنافسين',
      finish: 'إطلاق المطبخ',
      next: 'التالي',
      back: 'رجوع',
    },
    app: {
      overview: 'لوحة التحكم',
      projects: 'المشاريع',
      markets: 'سجل الأسواق',
      keywords: 'أبحاث الكلمات',
      ranks: 'تتبع الترتيب',
      competitors: 'المنافسون',
      audit: 'الفحص التقني',
      geo: 'ظهور الذكاء الاصطناعي GEO',
      aeo: 'فرص الإجابات AEO',
      content: 'استوديو المحتوى',
      agents: 'وكلاء الذكاء الاصطناعي',
      reports: 'التقارير',
      integrations: 'الربط والتكامل',
      team: 'الفريق والصلاحيات',
      billing: 'الاشتراك والاستهلاك',
      settings: 'الإعدادات و GDPR',
      logout: 'تسجيل الخروج',
      newProject: 'مشروع جديد',
      noProjectsTitle: 'لا توجد مشاريع بعد',
      noProjectsBody: 'أنشئ مشروعك الأول مع تحديد الدول واللغات ومحركات البحث المستهدفة.',
    },
  },
};
