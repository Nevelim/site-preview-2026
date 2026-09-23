/* Presentation interactions use illustrative scenarios, not live transport data. */
(() => {
  'use strict';
  const all = selector => [...document.querySelectorAll(selector)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const sections = all('section[id]');
  const menu = document.querySelector('.deck-menu');
  const motion = document.querySelector('.deck-motion');
  let paused = reduced.matches;
  let timer = 0;
  let heroVisible = false;
  const slides = all('.hero-shot .hs');
  const dots = all('.hero-shot .hs-dots button');
  let activeSlide = 0;
  function showSlide(index) {
    activeSlide = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      slide.classList.toggle('on', i === activeSlide);
      slide.setAttribute('aria-hidden', String(i !== activeSlide));
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle('on', i === activeSlide);
      dot.setAttribute('aria-pressed', String(i === activeSlide));
    });
    document.querySelector('.hs-cap').textContent = slides[activeSlide].alt;
    document.querySelector('.hero-screen-count').textContent = `${String(activeSlide + 1).padStart(2, '0')} / 06`;
  }
  function syncMotion() {
    const stopped = paused || reduced.matches;
    document.body.classList.toggle('deck-paused', stopped);
    document.body.classList.toggle('deck-hidden', document.hidden);
    motion.setAttribute('aria-pressed', String(stopped));
    motion.setAttribute('aria-label', reduced.matches ? 'Анимация отключена системной настройкой' : stopped ? 'Включить анимацию' : 'Приостановить анимацию');
    motion.title = motion.getAttribute('aria-label');
    motion.textContent = stopped ? '▷' : 'Ⅱ';
    motion.disabled = reduced.matches;
    clearInterval(timer);
    if (!stopped && !document.hidden && heroVisible) timer = setInterval(() => showSlide(activeSlide + 1), 6000);
  }
  dots.forEach((dot, index) => dot.addEventListener('click', () => { showSlide(index); paused = true; syncMotion(); }));
  motion.hidden = false;
  motion.addEventListener('click', () => { paused = !paused; syncMotion(); });
  reduced.addEventListener('change', () => { paused = reduced.matches; syncMotion(); });
  document.addEventListener('visibilitychange', syncMotion);
  showSlide(0);

  if ('IntersectionObserver' in window) {
    document.body.classList.add('deck-enhanced');
    const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('in'); reveal.unobserve(entry.target); }
    }), { threshold: 0.04 });
    all('.reveal,.stagger').forEach(el => reveal.observe(el));
    const scenes = new IntersectionObserver(entries => entries.forEach(entry => {
      entry.target.classList.toggle('scene-visible', entry.isIntersecting);
      if (entry.target.id === 'hero') { heroVisible = entry.isIntersecting; syncMotion(); }
    }));
    sections.forEach(section => scenes.observe(section));
  } else {
    heroVisible = true;
    sections.forEach(section => section.classList.add('scene-visible'));
  }
  all('.hl-line').forEach(line => line.classList.add('in'));
  syncMotion();

  const navLinks = all('nav a[href^="#"]');
  const primaryLinks = all('.nav-links a');
  let scrollFrame = 0;
  function updateNavigation() {
    scrollFrame = 0;
    const height = document.documentElement.scrollHeight - innerHeight;
    document.querySelector('#progress').style.width = `${Math.max(0, Math.min(100, scrollY / Math.max(1, height) * 100))}%`;
    let current = 'hero';
    sections.forEach(section => { if (section.getBoundingClientRect().top <= 140) current = section.id; });
    navLinks.forEach(link => {
      const selected = link.hash === `#${current}`;
      link.classList.toggle('active', selected);
      if (selected) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
    });
    const groups = { 'quality-workspace':'quality', platform:'features', schedules:'dispatch', planning:'dispatch', routes:'dispatch', standards:'quality', booking:'features', passengers:'features', tech:'effect', company:'effect' };
    primaryLinks.forEach(link => link.classList.toggle('active', link.hash === `#${groups[current] || current}`));
  }
  const queueNavigation = () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateNavigation); };
  addEventListener('scroll', queueNavigation, { passive:true });
  addEventListener('resize', queueNavigation, { passive:true });
  navLinks.forEach(link => link.addEventListener('click', () => { menu.open = false; }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); } });
  document.addEventListener('click', event => { if (!menu.contains(event.target)) menu.open = false; });
  updateNavigation();

  const cases = {
    reliability: {
      heading:'Рейс не выполнен. Причина должна быть видна.',
      titles:['Сопоставить план и факт','Подтвердить причину','Проверить восстановление'],
      texts:['Расписание, трек и события диспетчера показывают, где возникло отклонение. Отсутствие трека требует проверки.','Диспетчер уточняет: неисправность, нехватка водителя или дорожная задержка. Выбирает доступный резерв.','Заказчик контролирует фактический выпуск и повторяемость срывов по маршруту и перевозчику.'],
      result:'Управляемый процесс: от сигнала о срыве — до подтверждённого восстановления обслуживания.'
    },
    territory: {
      heading:'Остановка рядом — маршрут действительно доступен.',
      titles:['Оценить пешеходный доступ','Сравнить варианты сети','Проверить охват жителей'],
      texts:['Остановки, пешеходные подходы и жилые территории помогают увидеть участки с недостаточным обслуживанием.','Специалист рассматривает перенос остановки, изменение трассы или подвоз к регулярной сети.','Сопоставляются доступ к социальным объектам, пересадки и ограничения для маломобильных пассажиров.'],
      result:'Решения по маршрутной сети опираются на доступность поездки для жителей конкретной территории.'
    },
    time: {
      heading:'Расписание учитывает ожидание и пересадки.',
      titles:['Найти потери времени','Согласовать расписания','Сопоставить результат'],
      texts:['Плановые и фактические прибытия помогают разобрать интервалы, задержки и время ожидания.','Интервальные графики и пассажиропоток используются для выбора выпуска и согласования пересадок.','Изменения оцениваются на сопоставимых периодах с учётом времени суток и условий движения.'],
      result:'Команда видит, какие изменения расписания помогают сделать поездку предсказуемее.'
    },
    price: {
      heading:'Стоимость поездки оценивается вместе с условиями оплаты.',
      titles:['Собрать тарифные данные','Рассмотреть группы пассажиров','Сравнить сценарии'],
      texts:['Тарифы, проездные, пересадочные правила и льготы объединяются с данными о поездках.','Учитываются частота поездок, категории льготников и доступная статистика доходов.','Регион сопоставляет стоимость типовых поездок и месячные расходы при разных тарифных решениях.'],
      result:'Прозрачная основа для обсуждения тарифов и мер поддержки разных групп пассажиров.'
    }
  };
  const scenarioButtons = all('[data-quality-case]');
  scenarioButtons.forEach(button => button.addEventListener('click', () => {
    const item = cases[button.dataset.qualityCase];
    scenarioButtons.forEach(other => other.setAttribute('aria-pressed', String(button === other)));
    document.querySelector('#quality-case-title').textContent = item.heading;
    all('.quality-case-step').forEach((step, index) => {
      step.querySelector('h4').textContent = item.titles[index];
      step.querySelector('p').textContent = item.texts[index];
    });
    document.querySelector('#quality-case-result').textContent = item.result;
    queueNavigation();
  }));
})();
