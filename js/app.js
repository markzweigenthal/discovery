const CONFIG = window.VOOMA_CONFIG || {
  zapierWebhookUrl: 'https://hooks.zapier.com/hooks/catch/REPLACE/REPLACE/',
  calendlyUrl: 'https://calendly.com/your-team/quote-review',
  canopyConnectUrl: 'https://link.usecanopy.com/REPLACE',
  googleMapsApiKey: '',
  googleAddressAutocomplete: {
    enabled: true,
    country: 'us'
  },
  calendlyQuestionMap: {
    phone: 'a1',
    coverageSummary: 'a2'
  }
};

    const steps = ['intro', 'coverage', 'canopy', 'home', 'auto', 'umbrella', 'review'];
    const stepTitles = {
      intro: 'Contact',
      coverage: 'Coverages',
      canopy: 'Current insurance',
      home: 'Home',
      auto: 'Auto',
      umbrella: 'Umbrella',
      review: 'Review'
    };

    const state = {
      currentStepIndex: 0,
      selectedCoverage: [],
      vehicles: [],
      drivers: []
    };

    const form = document.getElementById('riskForm');
    const stepEls = [...document.querySelectorAll('.step')];
    const stepList = document.getElementById('stepList');
    const progressBar = document.getElementById('progressBar');
    const nextBtn = document.getElementById('nextBtn');
    const backBtn = document.getElementById('backBtn');
    const submitBtn = document.getElementById('submitBtn');
    const reviewPane = document.getElementById('reviewPane');
    const statusBox = document.getElementById('statusBox');
    const canopyLink = document.getElementById('canopyLink');
    canopyLink.href = CONFIG.canopyConnectUrl;

    function visibleSteps() {
      const coverages = getSelectedCoverage();
      return steps.filter(step => {
        if (step === 'home') return coverages.includes('Home');
        if (step === 'auto') return coverages.includes('Auto');
        if (step === 'umbrella') return coverages.includes('Umbrella');
        return true;
      });
    }

    function renderStepList() {
      const vis = visibleSteps();
      const current = vis[state.currentStepIndex];
      stepList.innerHTML = vis.map((step, index) => {
        const cls = step === current ? 'step-chip active' : index < state.currentStepIndex ? 'step-chip done' : 'step-chip';
        return `<button type="button" class="${cls}" data-step-index="${index}" aria-current="${step === current ? 'step' : 'false'}">${index + 1}. ${stepTitles[step]}</button>`;
      }).join('');
      progressBar.style.width = `${((state.currentStepIndex + 1) / vis.length) * 100}%`;

      stepList.querySelectorAll('[data-step-index]').forEach(btn => {
        btn.addEventListener('click', () => jumpToStep(Number(btn.dataset.stepIndex)));
      });
    }

    function showCurrentStep() {
      const vis = visibleSteps();
      stepEls.forEach(el => el.classList.add('hidden'));
      const currentKey = vis[state.currentStepIndex];
      const currentEl = document.querySelector(`.step[data-step="${currentKey}"]`);
      if (currentEl) currentEl.classList.remove('hidden');
      backBtn.classList.toggle('hidden', state.currentStepIndex === 0);
      nextBtn.classList.toggle('hidden', currentKey === 'review');
      submitBtn.classList.toggle('hidden', currentKey !== 'review');
      if (currentKey === 'review') buildReview();
      renderStepList();
    }

    function getSelectedCoverage() {
      return [...document.querySelectorAll('input[name="coverage"]:checked')].map(i => i.value);
    }

    function validateStep() {
      const currentKey = visibleSteps()[state.currentStepIndex];
      let valid = true;

      if (currentKey === 'intro') {
        const validators = {
          fullName: val => val.length > 0,
          email: val => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
          phone: val => normalizePhone(val).length === 10
        };

        ['fullName', 'email', 'phone'].forEach(id => {
          const el = document.getElementById(id);
          const value = el.value.trim();
          const bad = !validators[id](value);
          el.nextElementSibling.style.display = bad ? 'block' : 'none';
          if (bad) valid = false;
        });
      }

      if (currentKey === 'coverage') {
        const hasCoverage = getSelectedCoverage().length > 0;
        document.getElementById('coverageError').style.display = hasCoverage ? 'none' : 'block';
        valid = valid && hasCoverage;
      }

      if (currentKey === 'canopy') {
        const mode = document.querySelector('input[name="canopyMode"]:checked')?.value;
        const renewalEl = document.getElementById('manualRenewal');
        const renewalError = renewalEl.nextElementSibling;
        const renewalValue = renewalEl.value;
        const renewalBad = mode === 'No' && renewalValue && isPastDate(renewalValue);
        renewalError.style.display = renewalBad ? 'block' : 'none';
        if (renewalBad) valid = false;
      }

      return valid;
    }


    function normalizePhone(value) {
      const digits = String(value || '').replace(/\D/g, '');
      return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    }

    function formatPhoneInput(input) {
      const digits = normalizePhone(input.value).slice(0, 10);
      if (digits.length <= 3) input.value = digits;
      else if (digits.length <= 6) input.value = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
      else input.value = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }

    function isPastDate(value) {
      if (!value) return false;
      const inputDate = new Date(`${value}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return inputDate < today;
    }

    function buildReview() {
      const data = collectPayload();
      const cards = [];

      cards.push(reviewCard('Prospect', [
        `Name: ${data.contact.fullName || ''}`,
        `Email: ${data.contact.email || ''}`,
        `Phone: ${data.contact.phone || ''}`,
        `Current address: ${[data.contact.currentAddress, data.contact.currentCity, data.contact.currentState, data.contact.currentPostalCode].filter(Boolean).join(', ') || ''}`,
        `Years there: ${data.contact.yearsAtCurrentAddress || ''}`,
        `Residence status: ${data.contact.residenceStatus || ''}`,
        `Timeline: ${data.contact.timeline || ''}`
      ]));

      cards.push(reviewCard('Coverage requested', data.coverage.length ? data.coverage : ['None selected']));

      cards.push(reviewCard('Current insurance intake', [
        `Canopy mode: ${data.currentInsurance.canopyMode || ''}`,
        `Canopy status: ${data.currentInsurance.canopyStatus || ''}`,
        `Current carrier: ${data.currentInsurance.currentCarrier || data.currentInsurance.manualCarrier || ''}`
      ]));

      if (data.home) {
        cards.push(reviewCard('Home', [
          `Address: ${[data.home.propertyAddress, data.home.propertyCity, data.home.propertyState, data.home.propertyPostalCode].filter(Boolean).join(', ') || ''}`,
          `Occupancy: ${data.home.occupancy || ''}`,
          `Foundation: ${data.home.foundationType || ''}`,
          `Basement: ${data.home.hasBasement || ''}${data.home.hasBasement === 'Yes' ? ` / ${data.home.basementFinished || ''}` : ''}`,
          `Heating: ${data.home.heatingType || ''}`,
          `Heating updated: ${data.home.heatingUpdatedYear || ''}`,
          `Year built: ${data.home.yearBuilt || ''}`,
          `Claims: ${data.home.claimsHome || ''}`
        ]));
      }

      if (data.auto) {
        cards.push(reviewCard('Auto', [
          `Vehicles: ${data.auto.vehicles.length}`,
          `Drivers: ${data.auto.drivers.length}`,
          `Claims / violations: ${data.auto.claimsAuto || ''}`,
          `Higher liability interest: ${data.auto.liabilityInterest || ''}`
        ]));
      }

      if (data.umbrella) {
        cards.push(reviewCard('Umbrella', [
          `Desired limit: ${data.umbrella.umbrellaLimit || ''}`,
          `Young drivers: ${data.umbrella.youngDrivers || ''}`,
          `Other properties: ${data.umbrella.otherProperties || ''}`
        ]));
      }

      reviewPane.innerHTML = cards.join('');
    }

    function reviewCard(title, items) {
      return `
        <div class="review-card">
          <h4>${title}</h4>
          <ul class="review-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        </div>
      `;
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function collectPayload() {
      const coverage = getSelectedCoverage();
      const canopyMode = document.querySelector('input[name="canopyMode"]:checked')?.value || 'Yes';

      return {
        submittedAt: new Date().toISOString(),
        source: 'VOOMA Risk Intake Form',
        contact: {
          fullName: value('fullName'),
          email: value('email'),
          phone: normalizePhone(value('phone')),
          currentAddress: value('currentAddress'),
          currentCity: value('currentCity'),
          currentState: value('currentState'),
          currentPostalCode: value('currentPostalCode'),
          currentPlaceId: value('currentPlaceId'),
          yearsAtCurrentAddress: value('yearsAtCurrentAddress'),
          residenceStatus: value('residenceStatus'),
          zip: value('zip'),
          contactPreference: value('contactPreference'),
          timeline: value('timeline'),
          referralSource: value('referralSource'),
          notes: value('notes')
        },
        coverage,
        currentInsurance: {
          canopyMode,
          canopyStatus: value('canopyStatus'),
          currentCarrier: value('currentCarrier'),
          manualCarrier: value('manualCarrier'),
          manualRenewal: value('manualRenewal'),
          currentPremium: value('currentPremium'),
          currentLiability: value('currentLiability')
        },
        home: coverage.includes('Home') ? {
          homeAddressMode: value('homeAddressMode'),
          propertyAddress: getHomeAddressPayload().propertyAddress,
          propertyCity: getHomeAddressPayload().propertyCity,
          propertyState: getHomeAddressPayload().propertyState,
          propertyPostalCode: getHomeAddressPayload().propertyPostalCode,
          propertyPlaceId: getHomeAddressPayload().propertyPlaceId,
          occupancy: value('occupancy'),
          yearBuilt: value('yearBuilt'),
          squareFeet: value('squareFeet'),
          roofAge: value('roofAge'),
          constructionType: value('constructionType'),
          foundationType: value('foundationType'),
          heatingType: value('heatingType'),
          heatingUpdatedYear: value('heatingUpdatedYear'),
          hasBasement: value('hasBasement'),
          basementFinished: value('basementFinished'),
          pool: value('pool'),
          dog: value('dog'),
          claimsHome: value('claimsHome'),
          homeNotes: value('homeNotes')
        } : null,
        auto: coverage.includes('Auto') ? {
          vehicles: collectRepeaters('#vehicleList .vehicle-card'),
          drivers: collectRepeaters('#driverList .driver-card'),
          claimsAuto: value('claimsAuto'),
          liabilityInterest: value('liabilityInterest')
        } : null,
        umbrella: coverage.includes('Umbrella') ? {
          umbrellaLimit: value('umbrellaLimit'),
          youngDrivers: value('youngDrivers'),
          otherProperties: value('otherProperties'),
          underlyingHomeLimit: value('underlyingHomeLimit'),
          underlyingAutoLimit: value('underlyingAutoLimit')
        } : null
      };
    }

    function collectRepeaters(selector) {
      return [...document.querySelectorAll(selector)].map(card => {
        const data = {};
        card.querySelectorAll('[data-name]').forEach(input => {
          data[input.dataset.name] = input.value;
        });
        return data;
      });
    }

    function value(id) {
      return document.getElementById(id)?.value?.trim?.() ?? document.getElementById(id)?.value ?? '';
    }

    async function initGoogleAddressAutocomplete() {
      const currentHelp = document.getElementById('currentAddressHelp');
      const propertyHelp = document.getElementById('propertyAddressHelp');

      if (!CONFIG.googleAddressAutocomplete?.enabled || !CONFIG.googleMapsApiKey) {
        if (currentHelp) currentHelp.textContent = 'Optional: add a Google Maps API key in CONFIG to enable address suggestions and ZIP auto-fill.';
        if (propertyHelp) propertyHelp.textContent = 'Optional: add a Google Maps API key in CONFIG to enable address suggestions and ZIP auto-fill.';
        syncHomeAddressFromCurrent();
        return;
      }

      try {
        if (!window.google?.maps?.places) {
          await loadGoogleMapsScript();
        }

        initAddressAutocompleteField('currentAddress', 'current', currentHelp);
        initAddressAutocompleteField('propertyAddress', 'property', propertyHelp);
        syncHomeAddressFromCurrent();

        if (currentHelp) currentHelp.textContent = 'Start typing and choose a suggested address to prefill and standardize it.';
        if (propertyHelp) propertyHelp.textContent = 'Start typing and choose a suggested address to prefill and standardize it.';
      } catch (error) {
        console.error('Google Places could not be loaded.', error);
        if (currentHelp) currentHelp.textContent = 'Google Places could not be loaded. The address field will still work normally.';
        if (propertyHelp) propertyHelp.textContent = 'Google Places could not be loaded. The address field will still work normally.';
        syncHomeAddressFromCurrent();
      }
    }

    function initAddressAutocompleteField(inputId, prefix, helpEl) {
      const input = document.getElementById(inputId);
      if (!input) return;

      const autocomplete = new google.maps.places.Autocomplete(input, {
        types: ['address'],
        componentRestrictions: CONFIG.googleAddressAutocomplete.country ? { country: CONFIG.googleAddressAutocomplete.country } : undefined,
        fields: ['address_components', 'formatted_address', 'place_id']
      });

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place) return;
        populateAddressFields(place, prefix);
        if (prefix === 'current') syncHomeAddressFromCurrent();
        if (helpEl) helpEl.textContent = 'Address matched through Google Places.';
      });
    }

    function getHomeAddressPayload() {
      if (value('homeAddressMode') === 'current') {
        return {
          propertyAddress: value('currentAddress'),
          propertyCity: value('currentCity'),
          propertyState: value('currentState'),
          propertyPostalCode: value('currentPostalCode'),
          propertyPlaceId: value('currentPlaceId')
        };
      }

      return {
        propertyAddress: value('propertyAddress'),
        propertyCity: value('propertyCity'),
        propertyState: value('propertyState'),
        propertyPostalCode: value('propertyPostalCode'),
        propertyPlaceId: value('propertyPlaceId')
      };
    }

    function syncHomeAddressFromCurrent() {
      if (value('homeAddressMode') !== 'current') return;
      const currentAddress = document.getElementById('currentAddress').value;
      document.getElementById('propertyAddressCurrent').value = currentAddress;
    }

    function loadGoogleMapsScript() {
      return new Promise((resolve, reject) => {
        if (window.google?.maps?.places) return resolve();
        const existing = document.querySelector('script[data-google-maps="true"]');
        if (existing) {
          existing.addEventListener('load', resolve, { once: true });
          existing.addEventListener('error', reject, { once: true });
          return;
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(CONFIG.googleMapsApiKey)}&libraries=places`;
        script.async = true;
        script.defer = true;
        script.dataset.googleMaps = 'true';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    function populateAddressFields(place, prefix = 'property') {
      const components = {};
      (place.address_components || []).forEach(component => {
        component.types.forEach(type => {
          components[type] = component;
        });
      });

      const streetNumber = components.street_number?.long_name || '';
      const route = components.route?.long_name || '';
      const city = components.locality?.long_name || components.sublocality?.long_name || components.postal_town?.long_name || '';
      const state = components.administrative_area_level_1?.short_name || '';
      const postalCode = components.postal_code?.long_name || '';
      const addressValue = `${streetNumber} ${route}`.trim() || place.formatted_address || '';

      const fieldMap = {
        property: {
          address: 'propertyAddress',
          city: 'propertyCity',
          state: 'propertyState',
          postal: 'propertyPostalCode',
          placeId: 'propertyPlaceId'
        },
        current: {
          address: 'currentAddress',
          city: 'currentCity',
          state: 'currentState',
          postal: 'currentPostalCode',
          placeId: 'currentPlaceId'
        }
      }[prefix];

      if (!fieldMap) return;

      document.getElementById(fieldMap.address).value = addressValue;
      document.getElementById(fieldMap.city).value = city;
      document.getElementById(fieldMap.state).value = state;
      document.getElementById(fieldMap.postal).value = postalCode;
      document.getElementById(fieldMap.placeId).value = place.place_id || '';

      if (!document.getElementById('zip').value && postalCode) {
        document.getElementById('zip').value = postalCode;
      }
    }

    function updateCoverageUI() {
      document.querySelectorAll('#coverageChoices .choice').forEach(choice => {
        const checked = choice.querySelector('input').checked;
        choice.classList.toggle('selected', checked);
      });
    }

    function updateCanopyUI() {
      document.querySelectorAll('#canopyChoices .choice').forEach(choice => {
        const checked = choice.querySelector('input').checked;
        choice.classList.toggle('selected', checked);
      });
      const mode = document.querySelector('input[name="canopyMode"]:checked')?.value;
      document.getElementById('canopyBlock').classList.toggle('hidden', mode !== 'Yes');
      document.getElementById('manualInsuranceBlock').classList.toggle('hidden', mode !== 'No');
    }

    function updateHomeUI() {
      const hasBasement = value('hasBasement') === 'Yes';
      const basementField = document.getElementById('basementFinishedField');
      basementField.classList.toggle('hidden', !hasBasement);
      if (!hasBasement) {
        document.getElementById('basementFinished').value = 'No';
      }
    }

    function updateHomeAddressUI() {
      const useCurrent = value('homeAddressMode') === 'current';
      document.getElementById('currentAddressSelectedBlock').classList.toggle('hidden', !useCurrent);
      document.getElementById('newAddressBlock').classList.toggle('hidden', useCurrent);
      if (useCurrent) {
        syncHomeAddressFromCurrent();
      }
    }

    function jumpToStep(targetIndex) {
      const vis = visibleSteps();
      if (targetIndex < 0 || targetIndex >= vis.length) return;
      if (targetIndex > state.currentStepIndex && !validateStep()) return;
      state.currentStepIndex = targetIndex;
      showCurrentStep();
    }

    function addRepeater(type) {
      const tpl = document.getElementById(type === 'vehicle' ? 'vehicleTemplate' : 'driverTemplate');
      const target = document.getElementById(type === 'vehicle' ? 'vehicleList' : 'driverList');
      const clone = tpl.content.firstElementChild.cloneNode(true);
      target.appendChild(clone);
      renumberRepeaters(type);
      clone.querySelector('.remove-item').addEventListener('click', () => {
        clone.remove();
        renumberRepeaters(type);
      });
    }

    function renumberRepeaters(type) {
      const selector = type === 'vehicle' ? '#vehicleList .vehicle-card' : '#driverList .driver-card';
      document.querySelectorAll(selector).forEach((card, index) => {
        const span = card.querySelector(type === 'vehicle' ? '.vehicle-number' : '.driver-number');
        span.textContent = index + 1;
      });
    }

    function nextStep() {
      if (!validateStep()) return;
      const vis = visibleSteps();
      if (state.currentStepIndex < vis.length - 1) {
        state.currentStepIndex += 1;
        showCurrentStep();
      }
    }

    function backStep() {
      if (state.currentStepIndex > 0) {
        state.currentStepIndex -= 1;
        showCurrentStep();
      }
    }

    function buildCalendlyUrl(payload) {
      const params = new URLSearchParams();
      params.set('name', payload.contact.fullName || '');
      params.set('email', payload.contact.email || '');
      params.set(CONFIG.calendlyQuestionMap.phone, payload.contact.phone || '');
      params.set(CONFIG.calendlyQuestionMap.coverageSummary, payload.coverage.join(', '));
      return `${CONFIG.calendlyUrl}?${params.toString()}`;
    }

    async function submitToZapier(payload) {
      const body = JSON.stringify(payload);
      try {
        const response = await fetch(CONFIG.zapierWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return true;
      } catch (error) {
        try {
          const ok = navigator.sendBeacon && navigator.sendBeacon(CONFIG.zapierWebhookUrl, new Blob([body], { type: 'application/json' }));
          return !!ok;
        } catch (_) {
          return false;
        }
      }
    }

    document.getElementById('addVehicle').addEventListener('click', () => addRepeater('vehicle'));
    document.getElementById('addDriver').addEventListener('click', () => addRepeater('driver'));
    nextBtn.addEventListener('click', nextStep);
    backBtn.addEventListener('click', backStep);
    document.getElementById('phone').addEventListener('input', (e) => formatPhoneInput(e.target));
    document.getElementById('email').addEventListener('blur', (e) => {
      const bad = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value.trim());
      e.target.nextElementSibling.style.display = e.target.value.trim() && bad ? 'block' : 'none';
    });
    document.getElementById('manualRenewal').addEventListener('change', (e) => {
      e.target.nextElementSibling.style.display = isPastDate(e.target.value) ? 'block' : 'none';
    });

    document.querySelectorAll('input[name="coverage"]').forEach(input => input.addEventListener('change', () => {
      updateCoverageUI();
      renderStepList();
    }));

    document.querySelectorAll('input[name="canopyMode"]').forEach(input => input.addEventListener('change', updateCanopyUI));
    document.getElementById('hasBasement')?.addEventListener('change', updateHomeUI);
    document.getElementById('homeAddressMode')?.addEventListener('change', updateHomeAddressUI);
    document.getElementById('currentAddress')?.addEventListener('input', syncHomeAddressFromCurrent);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = collectPayload();
      statusBox.textContent = 'Sending structured data to Zapier...';
      submitBtn.disabled = true;
      const sent = await submitToZapier(payload);
      if (sent) {
        statusBox.textContent = 'Sent. Redirecting to Calendly for the quote review meeting...';
        window.location.href = buildCalendlyUrl(payload);
      } else {
        statusBox.textContent = 'The Zapier handoff could not be confirmed. Check your webhook URL or browser console before going live.';
        submitBtn.disabled = false;
      }
    });

    // Initialize
    updateCoverageUI();
    updateCanopyUI();
    updateHomeUI();
    updateHomeAddressUI();
    addRepeater('vehicle');
    addRepeater('driver');
    initGoogleAddressAutocomplete();
    showCurrentStep();
