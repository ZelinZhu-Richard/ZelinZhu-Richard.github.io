<script setup>
// The Contact page: the contact lines and four links over the scene in 'contact' mode
// (SceneCanvas sets the mode from the route). Plain links; it needs no JavaScript.
import { definePageMeta } from '#imports';
import content from '#build/site-content.mjs';
import { useHomeHead } from '~/composables/useHomeHead.js';
import { lines } from '~/utils/text.js';

// The same file is served at /contacts/index.html; the alias keeps the router from
// treating that address as a missing page.
definePageMeta({ alias: ['/contacts/index.html'] });
useHomeHead('contact');

const { hero, ui } = content;
const contactLines = content.contact.lines.map(lines);
const links = content.contact.links;
</script>

<template>
  <main id="main" class="page page-contact">
    <section class="contact" aria-labelledby="contact-title">
      <div class="beat-block contact-block">
        <h1 class="contact-name">{{ hero.name }}</h1>
        <h2 id="contact-title" class="contact-title">{{ ui.contact }}</h2>
        <p v-for="(line, i) in contactLines" :key="i" class="contact-line"><RichLines :lines="line" /></p>
        <ul class="contact-links">
          <li v-for="link in links" :key="link.id">
            <a :href="link.href" :rel="link.id === 'email' ? undefined : 'me'">{{ link.label }}</a>
          </li>
        </ul>
      </div>
    </section>
    <SectionsNav class="contact-index" />
  </main>
</template>
