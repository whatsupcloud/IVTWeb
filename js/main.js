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
      var status = form.querySelector('[data-form-status]');
      if (!submitButton) return;

      if (location.protocol === 'file:') {
        if (status) {
          status.textContent = 'Please open this website through the IVT local server so enquiries can be saved.';
        }
        return;
      }

      var formData = new FormData(form);
      var payload = Object.fromEntries(formData.entries());
      var originalLabel = submitButton.textContent;

      submitButton.textContent = 'Submitting Request';
      submitButton.disabled = true;
      if (status) status.textContent = '';

      fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          return response.text().then(function (text) {
            var data;
            try {
              data = JSON.parse(text || '{}');
            } catch (error) {
              data = { ok: false, message: 'Server returned an unexpected response.' };
            }

            if (!response.ok || !data.ok) {
              throw new Error(data.message || 'Unable to save enquiry right now.');
            }

            return data;
          });
        })
        .then(function () {
          if (status) {
            status.textContent = 'Thank you. Your enquiry has been received successfully. Our team will review your requirement and get in touch with you shortly.';
          }
          form.reset();
        })
        .catch(function (error) {
          if (status) {
            status.textContent = error.message || 'Unable to save enquiry right now.';
          }
        })
        .finally(function () {
          submitButton.textContent = originalLabel;
          submitButton.disabled = false;
        });
    });
  }

  var chatbotToggle = document.querySelector('[data-chatbot-toggle]');
  var chatbotPanel = document.querySelector('[data-chatbot-panel]');
  var chatbotMessages = document.querySelector('[data-chatbot-messages]');
  var chatbotForm = document.querySelector('[data-chatbot-form]');
  var chatbotInput = document.querySelector('[data-chatbot-input]');
  var quickActions = document.querySelectorAll('[data-chatbot-question]');

  function appendChatMessage(text, role) {
    if (!chatbotMessages) return;
    var item = document.createElement('div');
    item.className = 'chatbot-message ' + (role === 'user' ? 'chatbot-user' : 'chatbot-bot');
    item.textContent = text;
    chatbotMessages.appendChild(item);
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
  }

  function getChatbotReply(message) {
    var value = (message || '').toLowerCase();

    if (value.indexOf('service') !== -1 || value.indexOf('ai') !== -1) {
      return 'IVT offers AI solutions, machine learning, data analytics, websites, and mobile app development.';
    }

    if (value.indexOf('contact') !== -1 || value.indexOf('email') !== -1) {
      return 'You can reach IVT at inovalyticstechnology@gmail.com or use the Contact page for project enquiries.';
    }

    if (value.indexOf('price') !== -1 || value.indexOf('cost') !== -1 || value.indexOf('quote') !== -1) {
      return 'IVT shares pricing after understanding your project scope, timeline, and required features.';
    }

    if (value.indexOf('location') !== -1 || value.indexOf('pune') !== -1) {
      return 'IVT is based in Pune, India and supports clients remotely as well as through scheduled consultations.';
    }

    if (value.indexOf('website') !== -1 || value.indexOf('app') !== -1 || value.indexOf('chatbot') !== -1) {
      return 'IVT can build business websites, mobile apps, dashboards, and chatbot-based automation solutions.';
    }

    return 'IVT is here to help with services, pricing, project planning, and contact details. Ask me anything about your project.';
  }

  if (chatbotToggle && chatbotPanel) {
    chatbotToggle.setAttribute('aria-expanded', 'false');

    chatbotToggle.addEventListener('click', function () {
      var isOpen = chatbotPanel.classList.toggle('open');
      chatbotToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }

  quickActions.forEach(function (button) {
    button.addEventListener('click', function () {
      var question = button.getAttribute('data-chatbot-question');
      appendChatMessage(question, 'user');
      appendChatMessage(getChatbotReply(question), 'bot');
      if (chatbotPanel) chatbotPanel.classList.add('open');
      if (chatbotToggle) chatbotToggle.setAttribute('aria-expanded', 'true');
    });
  });

  if (chatbotForm && chatbotInput) {
    chatbotForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var question = chatbotInput.value.trim();
      if (!question) return;

      appendChatMessage(question, 'user');
      appendChatMessage(getChatbotReply(question), 'bot');
      chatbotInput.value = '';
    });
  }
})();



