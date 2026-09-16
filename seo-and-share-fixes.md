# SEO + share-preview fixes for digitalelegance.com/hhn

Paste inside the `<head>` of the page (adjust the image URL to a real
1200x630 image on your domain if you add one):

```html
<title>HHN Wait Times at a Glance | Halloween Horror Nights Tracker</title>
<meta name="description" content="See every Halloween Horror Nights house wait time on one screen. Free, no login, updates every 30 seconds.">
<link rel="canonical" href="https://digitalelegance.com/hhn">

<meta property="og:type" content="website">
<meta property="og:title" content="HHN Wait Times at a Glance">
<meta property="og:description" content="Every HHN house wait on one screen. Free, no login, updates every 30 seconds.">
<meta property="og:url" content="https://digitalelegance.com/hhn">
<meta property="og:image" content="https://digitalelegance.com/hhn/og-image.png">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="HHN Wait Times at a Glance">
<meta name="twitter:description" content="Every HHN house wait on one screen. Free, no login, updates every 30 seconds.">
<meta name="twitter:image" content="https://digitalelegance.com/hhn/og-image.png">
```

Why: right now a shared link likely shows a bare URL with no preview
card. OG/Twitter tags turn every share into a proper preview with a
title and description, which lifts click-through a lot.

Also add near the top of the page (visible HTML, good for SEO):

```html
<h1>Halloween Horror Nights Wait Times at a Glance</h1>
<p>Live HHN house wait times on one screen — free, no login, refreshed every 30 seconds.</p>
```

And a one-tap share button wired to the Web Share API with fallback to
copy-link:

```html
<button id="shareBtn">Share this tracker</button>
<script>
document.getElementById('shareBtn').onclick = async () => {
  const data = { title: 'HHN Wait Times at a Glance',
                 text: 'Every HHN house wait on one screen — free, no login:',
                 url: 'https://digitalelegance.com/hhn' };
  if (navigator.share) { try { await navigator.share(data); } catch(e){} }
  else { await navigator.clipboard.writeText(data.url); alert('Link copied — paste it in your group chat!'); }
};
</script>
```
