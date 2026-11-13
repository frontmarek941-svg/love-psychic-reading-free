/**
 * LPRF Theme Navigation
 */
(function() {
    'use strict';

    const nav = document.querySelector('.site-nav');
    const mobileToggle = document.querySelector('.mobile-toggle');
    const mobileMenu = document.querySelector('.mobile-menu');

    // Scroll state
    if (nav) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 100) {
                nav.classList.add('scrolled');
            } else {
                nav.classList.remove('scrolled');
            }
        }, { passive: true });
    }

    // Mobile menu toggle
    if (mobileToggle && mobileMenu) {
        mobileToggle.addEventListener('click', function() {
            mobileMenu.classList.toggle('open');
            const isOpen = mobileMenu.classList.contains('open');
            mobileToggle.querySelector('.icon-open').style.display = isOpen ? 'none' : 'block';
            mobileToggle.querySelector('.icon-close').style.display = isOpen ? 'block' : 'none';
        });

        // Close on link click
        mobileMenu.querySelectorAll('a').forEach(function(link) {
            link.addEventListener('click', function() {
                mobileMenu.classList.remove('open');
                mobileToggle.querySelector('.icon-open').style.display = 'block';
                mobileToggle.querySelector('.icon-close').style.display = 'none';
            });
        });
    }

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
        anchor.addEventListener('click', function(e) {
            var target = document.querySelector(this.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // FAQ Accordion
    document.querySelectorAll('.accordion-trigger').forEach(function(trigger) {
        trigger.addEventListener('click', function() {
            var item = this.closest('.accordion-item');
            var wasActive = item.classList.contains('active');

            // Close all
            document.querySelectorAll('.accordion-item').forEach(function(i) {
                i.classList.remove('active');
            });

            // Toggle current
            if (!wasActive) {
                item.classList.add('active');
            }
        });
    });
})();
