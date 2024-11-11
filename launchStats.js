let globe, locations, nextLaunch;
let progressBar;

function createProgressBar() {
    progressBar = {
        element: document.querySelector('.progress-fill'),
        text: document.querySelector('.progress-text'),
        update: function(progress) {
            this.element.style.width = `${progress}%`;
            this.text.textContent = `${Math.round(progress)}%`;
        }
    };
}

function createEmptyCards() {
    const locationGrid = document.getElementById('location-grid');
    for (let i = 0; i < 10; i++) {
        const card = document.createElement('div');
        card.className = 'location-card';
        card.innerHTML = `<h3>Loading...</h3><p>Launches: --</p>`;
        locationGrid.appendChild(card);
    }
}

function createNextLaunchCard() {
    const card = document.getElementById('next-launch-card');
    card.innerHTML = `
        <h3>Next Upcoming Launch</h3>
        <p>Loading...</p>
    `;
    //document.querySelector('.results-container').insertBefore(card, document.getElementById('location-grid'));
}

async function fetchLaunchData() {
    const currentYear = new Date().getFullYear();
    const apiUrl = 'https://lldev.thespacedevs.com/2.3.0/launches/?format=json&mode=detailed&net__gte=' + currentYear + '-01-01T00%3A00%3A00Z&net__lte=' + currentYear + '-12-31T23%3A59%3A59Z';
    const nextLaunchUrl = 'https://lldev.thespacedevs.com/2.3.0/launches/upcoming/?limit=1';
    createProgressBar();
    createLoadingGlobe();
    createEmptyCards();
    createNextLaunchCard();

    try {
        let allLaunches = [];
        let nextUrl = apiUrl;
        let totalCount;

        while (nextUrl) {
            const response = await fetch(nextUrl);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json();
            allLaunches = allLaunches.concat(data.results);
            nextUrl = data.next;
            
            if (!totalCount) {
                totalCount = data.count;
            }

            const progress = (allLaunches.length / totalCount) * 100;
            progressBar.update(Math.min(progress, 90));
        }

        const { totalLaunches, topLocations } = processLaunchData(allLaunches);
        updateCards(topLocations);
        document.getElementById('total-launches').textContent = `Total launches worldwide: ${totalLaunches}`;

        const nextLaunchResponse = await fetch(nextLaunchUrl);
        const nextLaunchData = await nextLaunchResponse.json();
        nextLaunch = {
            location: nextLaunchData.results[0]?.pad?.location?.name || 'Unknown',
            latitude: nextLaunchData.results[0]?.pad?.latitude || '--',
            longitude: nextLaunchData.results[0]?.pad?.longitude || '--',
            net: new Date(nextLaunchData.results[0]?.net || 'Unknown')
        };

        progressBar.update(100);
        createGlobe(topLocations);
        updateNextLaunchCard(nextLaunch);

        setTimeout(() => {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('content').style.display = 'block';
        }, 1000);

    } catch (error) {
        console.error('Error fetching launch data:', error);
        document.getElementById('loading').innerHTML = '<p>Error loading data. Please try again later.</p>';
    }
}

function processLaunchData(launches) {
    const locationCounts = {};
    launches.forEach(launch => {
        if (launch.status && launch.status.abbrev === 'Success') {
            const locationName = launch.pad?.location?.name || 'Unknown Location';
            const country = launch.pad?.location?.country_code || 'Unknown';
            if (!locationCounts[locationName]) {
                locationCounts[locationName] = {
                    count: 0,
                    country: country,
                    latitude: launch.pad?.latitude || 0,
                    longitude: launch.pad?.longitude || 0,
                    launches: []
                };
            }
            locationCounts[locationName].count++;
            locationCounts[locationName].launches.push({
                name: launch.name,
                net: new Date(launch.net)
            });
        }
    });

    const sortedLocations = Object.entries(locationCounts)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10);

    return { totalLaunches: launches.length, topLocations: sortedLocations };
}

function updateCards(topLocations) {
    const cards = document.querySelectorAll('.location-card');
    topLocations.forEach((location, index) => {
        const [name, data] = location;
        const card = cards[index];
        let lastLaunchHTML = '';
        let nextLaunchHTML = '';

        // Get last launch details
        const lastLaunch = data.launches.reduce((prev, current) => {
            return (prev.net > current.net) ? prev : current;
        }, { net: new Date(0), name: 'N/A' });

        // Get next launch details
        const nextLaunch = data.launches.reduce((prev, current) => {
            return (prev.net < current.net) ? current : prev;
        }, { net: new Date(9999, 11, 31), name: 'N/A' });

        if (lastLaunch.net.getTime() > 0) {
            lastLaunchHTML = `
                <p>Last Launch: ${lastLaunch.name}</p>
                <p>Date: ${lastLaunch.net.toLocaleString()}</p>
            `;
        }

        if (nextLaunch.net.getTime() < new Date(9999, 11, 31).getTime()) {
            nextLaunchHTML = `
                <p>Next Launch: ${nextLaunch.name}</p>
                <p>Date: ${nextLaunch.net.toLocaleString()}</p>
            `;
        }

        card.innerHTML = `
            <h3>${name}</h3>
            <p>Successful launches: ${data.count}</p>
            <p>Country: ${data.country}</p>
            ${lastLaunchHTML}
            ${nextLaunchHTML}
        `;

        if (nextLaunch.net.getTime() > new Date().getTime()) {
            card.classList.add('next-launch-card');
            blinkCard(card);
        }
    });
}


function createLoadingGlobe() {
    const width = 300;
    const height = 300;
    const projection = d3.geoOrthographic().scale(80).translate([width / 2, height / 2]);
    const path = d3.geoPath().projection(projection);

    const svg = d3.select('#loading-globe')
        .attr('width', width)
        .attr('height', height);

    svg.append('circle')
        .attr('fill', '#001320')
        .attr('stroke', '#bb86fc')
        .attr('stroke-width', '0.2')
        .attr('cx', width / 2)
        .attr('cy', height / 2)
        .attr('r', 80);

    const graticule = d3.geoGraticule();
    svg.append('path')
        .datum(graticule)
        .attr('class', 'graticule')
        .attr('d', path)
        .attr('fill', 'none')
        .attr('stroke', '#bb86fc')
        .attr('stroke-width', '0.2px');

    function rotateGlobe() {
        projection.rotate([Date.now() / 100, 0]);
        svg.selectAll('path').attr('d', path);
    }

    d3.timer(rotateGlobe);
}

function createGlobe(topLocations) {
    const width = 300;
    const height = 300;
    const sensitivity = 75;

    const projection = d3.geoOrthographic()
        .scale(150)
        .center([0, 0])
        .rotate([0, -30])
        .translate([width / 2, height / 2]);

    const path = d3.geoPath().projection(projection);

    const svg = d3.select('#globe')
        .attr('width', width)
        .attr('height', height);

    svg.selectAll("*").remove();

    svg.append('circle')
        .attr('fill', '#001320')
        .attr('stroke', getComputedStyle(document.documentElement).getPropertyValue('--accent-color'))
        .attr('stroke-width', '0.2')
        .attr('cx', width / 2)
        .attr('cy', height / 2)
        .attr('r', 150);

    const g = svg.append('g');

    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
        .then(world => {
            g.selectAll('path')
                .data(topojson.feature(world, world.objects.countries).features)
                .enter().append('path')
                .attr('d', path)
                .attr('fill', '#0f2c4e')
                .attr('stroke', getComputedStyle(document.documentElement).getPropertyValue('--accent-color'))
                .attr('stroke-width', '0.5px');

            const graticule = d3.geoGraticule();
            g.append('path')
                .datum(graticule)
                .attr('class', 'graticule')
                .attr('d', path)
                .attr('fill', 'none')
                .attr('stroke', getComputedStyle(document.documentElement).getPropertyValue('--accent-color'))
                .attr('stroke-width', '0.5px');

            const locationPoints = g.selectAll('.location')
                .data(topLocations)
                .enter()
                .append('circle')
                .attr('class', 'location')
                .attr('r', 3)
                .attr('fill', getComputedStyle(document.documentElement).getPropertyValue('--accent-color'));

            if (nextLaunch && nextLaunch.longitude && nextLaunch.latitude) {
                const nextLaunchDot = g.append('circle')
                    .attr('class', 'next-launch')
                    .attr('r', 5)
                    .attr('fill', 'rgb(255, 0, 0)');

                function blinkNextLaunch() {
                    const timeUntilLaunch = nextLaunch.net - new Date();
                    const blinkRate = Math.max(100, 1000 - timeUntilLaunch / 60000);
                    const t = d3.now() % 30 / 3000;
                    const color = d3.interpolateRgb("rgb(255, 0, 0)", "rgb(0, 0, 255)")(t);
                    nextLaunchDot.transition()
                        .duration(blinkRate / 2)
                        .attr('opacity', 0)
                        .transition()
                        .duration(blinkRate / 2)
                        .attr('opacity', 1)
                        .attr('fill', color)
                        .on('end', blinkNextLaunch);
                }

                blinkNextLaunch();
            }

            function rotateGlobe() {
                const rotation = projection.rotate();
                rotation[0] += 0.5;
                projection.rotate(rotation);
                g.selectAll('path').attr('d', path);
                locationPoints
                    .attr('cx', d => projection([d[1].longitude, d[1].latitude])[0])
                    .attr('cy', d => projection([d[1].longitude, d[1].latitude])[1]);
                if (nextLaunch && nextLaunch.longitude && nextLaunch.latitude) {
                    g.select('.next-launch')
                        .attr('cx', projection([nextLaunch.longitude, nextLaunch.latitude])[0])
                        .attr('cy', projection([nextLaunch.longitude, nextLaunch.latitude])[1]);
                }
            }

            d3.timer(rotateGlobe);
        });
}

function updateNextLaunchCard(nextLaunch) {
    const card = document.getElementById('next-launch-card');
    if (nextLaunch && nextLaunch.location && nextLaunch.net) {
        card.innerHTML = `
            <h3>Next Upcoming Launch</h3>
            <p>Mission: ${nextLaunch.name}</p>
            <p>Location: ${nextLaunch.location}</p>
            <p>Date: ${nextLaunch.net.toLocaleString()}</p>
            <p>Coordinates: ${nextLaunch.latitude.toFixed(4)}, ${nextLaunch.longitude.toFixed(4)}</p>
        `;
    } else {
        card.innerHTML = `
            <h3>Next Upcoming Launch</h3>
            <p>No upcoming launches found.</p>
        `;
    }
}

function blinkCard(card) {
    if (!nextLaunch?.net) return; // Prevent error if net is missing
    function blink() {
        const timeUntilLaunch = nextLaunch.net - new Date();
        const blinkRate = Math.max(100, 1000 - timeUntilLaunch / 60000);
        card.style.transition = `border-color ${blinkRate / 2}ms`;
        card.style.borderColor = (card.style.borderColor === 'red') ? 'transparent' : 'red';
        setTimeout(blink, blinkRate / 2);
    }
    blink();
}

document.addEventListener('DOMContentLoaded', fetchLaunchData);