(function () {
  var currentPage = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  document.querySelectorAll('.site-nav a[href]').forEach(function (link) {
    var href = (link.getAttribute('href') || '').toLowerCase();
    if (href === currentPage) {
      link.classList.add('active');
    }
  });

  var navToggle = document.querySelector('[data-nav-toggle]');
  var nav = document.querySelector('[data-nav]');

  if (navToggle && nav) {
    navToggle.setAttribute('aria-expanded', 'false');

    navToggle.addEventListener('click', function () {
      var isOpen = nav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  var revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealItems.length) {
    var revealObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    revealItems.forEach(function (item) {
      revealObserver.observe(item);
    });
  } else {
    revealItems.forEach(function (item) {
      item.classList.add('is-visible');
    });
  }

  var counterElements = document.querySelectorAll('[data-counter]');
  var countersAnimated = false;

  function animateCounters() {
    if (countersAnimated) return;
    countersAnimated = true;

    counterElements.forEach(function (el) {
      var target = Number(el.getAttribute('data-counter')) || 0;
      var isSupportCounter = target === 24;
      var duration = 1300;
      var stepTime = 20;
      var totalSteps = Math.max(1, Math.floor(duration / stepTime));
      var currentStep = 0;

      var timer = setInterval(function () {
        currentStep += 1;
        var currentValue = Math.round((target / totalSteps) * currentStep);

        if (currentValue > target) {
          currentValue = target;
        }

        el.textContent = isSupportCounter ? currentValue + '/7' : currentValue + '+';

        if (currentStep >= totalSteps) {
          clearInterval(timer);
          el.textContent = isSupportCounter ? target + '/7' : target + '+';
        }
      }, stepTime);
    });
  }

  if ('IntersectionObserver' in window && counterElements.length) {
    var statsSection = document.querySelector('.stats-section');

    if (statsSection) {
      var counterObserver = new IntersectionObserver(function (entries, observer) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCounters();
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.3 });

      counterObserver.observe(statsSection);
    } else {
      animateCounters();
    }
  } else if (counterElements.length) {
    animateCounters();
  }

  var backToTop = document.querySelector('[data-back-to-top]');
  if (backToTop) {
    window.addEventListener('scroll', function () {
      if (window.scrollY > 280) {
        backToTop.classList.add('show');
      } else {
        backToTop.classList.remove('show');
      }
    });

    backToTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  var form = document.querySelector('.contact-form');
  if (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var submitButton = form.querySelector('button[type="submit"]');
      if (!submitButton) return;

      var originalLabel = submitButton.textContent;
      submitButton.textContent = 'Enquiry Sent';
      submitButton.disabled = true;

      setTimeout(function () {
        form.reset();
        submitButton.textContent = originalLabel;
        submitButton.disabled = false;
      }, 1300);
    });
  }
})();
