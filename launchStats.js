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
    const locationGrid = document.querySelector('.location-grid');
    locationGrid.innerHTML = ''; // Clear any existing content
    for (let i = 0; i < 10; i++) {
        const card = document.createElement('div');
        card.className = 'location-card';
        card.innerHTML = `
            <div class="launch-count">--</div>
            <div class="launch-details">
                <h3>Loading...</h3>
                <p>Country: --</p>
                <div class="launch-info">
                    <div class="last-launch">
                        <strong>Last Launch:</strong><br>
                        Loading...
                    </div>
                    <div class="next-launch">
                        <strong>Next Launch:</strong><br>
                        Loading...
                    </div>
                    <div>
                    FLAG
                    </div>
                </div>
            </div>
        `;
        locationGrid.appendChild(card);
    }
}

function createNextLaunchCard() {
    const card = document.getElementById('next-launch-card');
    card.innerHTML = `
        <h3>Next Upcoming Launch</h3>
        <p>Loading...</p>
    `;
}

async function fetchLaunchData() {
    const currentYear = new Date().getFullYear();
    const utcDateTime = new Date().toISOString();
    const baseApiUrl = 'https://ll.thespacedevs.com/2.3.0/launches/';
    const apiUrl = `${baseApiUrl}?format=json&mode=detailed&net__gte=${currentYear}-01-01T00%3A00%3A00Z&net__lte=${currentYear}-12-31T23%3A59%3A59Z&limit=200&status__ids=3`;
    const nextLaunchUrl = `${baseApiUrl}?net__gt=${utcDateTime}&status__ids=1,2,8`;

    createProgressBar();
    createLoadingGlobe();
    createEmptyCards();
    createNextLaunchCard();

    let launches = [];
    let topLocations = [];
    let nextLaunches = [];

    try {
        // Make initial request to get the total count
        const initialResponse = await fetch(apiUrl);
        if (!initialResponse.ok) {
            throw new Error('Failed to fetch launch data');
        }
        
        const initialData = await initialResponse.json();
        const totalCount = initialData.count;
        console.log(`Total launches to fetch: ${totalCount}`);
        
        launches = [...initialData.results];
        let nextUrl = initialData.next;
        
        progressBar.update((launches.length / totalCount) * 100);

        while (nextUrl) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const response = await fetch(nextUrl);
            if (!response.ok) {
                throw new Error('Failed to fetch launch data');
            }
            
            const data = await response.json();
            launches = launches.concat(data.results);
            nextUrl = data.next;
            
            const progress = Math.min((launches.length / totalCount) * 100, 90);
            console.log(`Fetched ${launches.length} of ${totalCount} launches`);
            progressBar.update(progress);
        }

        console.log(`Completed fetching ${launches.length} launches`);

        const processedData = processLaunchData(launches);
        topLocations = processedData.topLocations;
        

        // Fetch next launch data
        try {
            const nextLaunchResponse = await fetch(nextLaunchUrl);
            const nextLaunchData = await nextLaunchResponse.json();

            // Process all upcoming launches
            nextLaunches = nextLaunchData.results.map(launch => ({
                name: launch.name || 'Unknown',
                location: launch.pad?.location?.name || 'Unknown',
                latitude: launch.pad?.latitude || '--',
                longitude: launch.pad?.longitude || '--',
                net: new Date(launch.net || 'Unknown')
            }));

            // Get the very next launch for the globe
            const nextLaunch = nextLaunches[0];

            updateNextLaunchCard(nextLaunch);
            createGlobe(topLocations, nextLaunch);
            processAndDisplayData(launches,nextLaunches);

        } catch (error) {
            console.error('Error fetching next launch data:', error);
            updateNextLaunchCard(null);
        }

    } catch (error) {
        console.error('Error fetching launch data:', error);
        document.getElementById('loading').innerHTML = '<p>Error loading data. Please try again later.</p>';
    }
}

function processAndDisplayData(allLaunches,nextLaunches) {
    const { totalLaunches, topLocations, topTenLocations } = processLaunchData(allLaunches);
    updateCards(topTenLocations,nextLaunches);
    const totalLaunchesElement = document.getElementById('total-launches');
    if (totalLaunchesElement) {
        totalLaunchesElement.textContent = `Total launches worldwide: ${totalLaunches}`;
    }

    progressBar.update(100);
    setTimeout(() => {
        const loadingElement = document.getElementById('loading');
        const contentElement = document.getElementById('content');
        if (loadingElement) loadingElement.style.display = 'none';
        if (contentElement) contentElement.style.display = 'block';
    }, 1000);
}

function processLaunchData(launches) {
    const locationCounts = {};
    launches.forEach(launch => {
        if (launch.status && launch.status.abbrev === 'Success') {
            const locationName = launch.pad?.location?.name || 'Unknown Location';
            const country = launch.pad?.location?.country?.name || 'Unknown';
            const country_code = launch.pad?.location?.country?.alpha_2_code || 'Unknown'
            if (!locationCounts[locationName]) {
                locationCounts[locationName] = {
                    count: 0,
                    country: country,
                    country_code: country_code,
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
        //.slice(0, 10);

    return {
        totalLaunches: launches.length, 
        topLocations: sortedLocations.slice(0, 15), // Keep 15 for the globe
        topTenLocations: sortedLocations.slice(0, 10) // Only show top 10 in cards
    };
}

function categorizeLaunchesByMission(launches) {
    const missionCategories = {
        Suborbital: 'Suborbital',
        LEO: 'Low Earth Orbit',
        MEO: 'Medium Earth Orbit',
        Geosynchronous: 'Geosynchronous',
        DeepSpace: 'Deep Space'
    };

    const countryLaunchData = {};

    launches.forEach(launch => {
        const country = launch.pad?.location?.country_code || 'Unknown';
        const missionType = determineMissionType(launch);

        if (!countryLaunchData[country]) {
            countryLaunchData[country] = {
                Suborbital: 0,
                LEO: 0,
                MEO: 0,
                Geosynchronous: 0,
                DeepSpace: 0
            };
        }
        countryLaunchData[country][missionType]++;
    });

    return countryLaunchData;
}

function determineMissionType(launch) {
    // Check if launch.mission and launch.mission.orbit exist and are strings
    if (launch.mission && typeof launch.mission.orbit === 'string') {
        const orbit = launch.mission.orbit.toLowerCase();
        if (orbit.includes("suborbital")) return "Suborbital";
        if (orbit.includes("leo")) return "LEO";
        if (orbit.includes("meo")) return "MEO";
        if (orbit.includes("geo")) return "Geosynchronous";
        if (orbit.includes("deep")) return "DeepSpace";
    }
    return "Unknown";
}

function updateCards(topLocations,nextLaunches) {
    const locationGrid = document.querySelector('.location-grid');
    if (!locationGrid) {
        console.error('Location grid element not found');
        return;
    }
    locationGrid.innerHTML = '';

    topLocations.forEach(([name, data]) => {
        const card = document.createElement('div');
        const flagUrl = `https://flagsapi.com/${data.country_code}/flat/64.png`;
        card.className = 'location-card';

        // Get last launch details
        const lastLaunch = data.launches
            .filter(launch => new Date(launch.net) < new Date())
            .sort((a, b) => new Date(b.net) - new Date(a.net))[0];

        // Find next launch for this location
        const nextLaunch = nextLaunches.find(launch => launch.location === name);

         // Format last launch display
         let lastLaunchHTML = 'No previous launches';
         if (lastLaunch) {
             lastLaunchHTML = `
                 ${lastLaunch.name}<br>
                 ${new Date(lastLaunch.net).toLocaleDateString()}
             `;
         }
 
         // Format next launch display
         let nextLaunchHTML = 'No scheduled launches';
         if (nextLaunch) {
             nextLaunchHTML = `
                 ${nextLaunch.name}<br>
                 ${nextLaunch.net.toLocaleDateString()}
             `;
         }

        card.innerHTML = `
            <div class="launch-count">${data.count}</div>
            <div class="launch-details">
                <h3>${name}</h3>
                <p>Country: ${data.country}</p>
                <div class="launch-info">
                    <div class="last-launch">
                        <strong>Last Launch:</strong><br>
                        ${lastLaunchHTML}
                    </div>
                    <div class="next-launch">
                        <strong>Next Launch:</strong><br>
                        ${nextLaunchHTML}
                    </div>
                    <div>
                        <img src="${flagUrl}" alt="${data.country} Flag" width="64" height="64">
                    </div>
                </div>
            </div>
        `;

        locationGrid.appendChild(card);
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

function createGlobe(topLocations,nextLaunch) {
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

                // Create an array of colors to cycle through
                const colors = [
                    '#ff0000', // Red
                    '#ff00ff', // Magenta
                    '#0000ff', // Blue
                    '#00ffff', // Cyan
                    '#00ff00', // Green
                    '#ffff00', // Yellow
                    '#ff0000'  // Back to red to complete the cycle
                ];

                // Create a color interpolator that cycles through all colors
                const colorScale = d3.scaleLinear()
                    .domain(d3.range(colors.length).map(d => d / (colors.length - 1)))
                    .range(colors)
                    .interpolate(d3.interpolateRgb);

                function rgbCycle() {
                    const duration = 3000; // Complete cycle every 3 seconds
                    
                    nextLaunchDot.transition()
                        .duration(duration)
                        .ease(d3.easeLinear)
                        .attrTween('fill', () => {
                            return (t) => colorScale(t);
                        })
                        .on('end', rgbCycle); // Loop the animation
                }

                rgbCycle();

                //function blinkNextLaunch() {
                //    const timeUntilLaunch = nextLaunch.net - new Date();
                //    const blinkRate = Math.max(1000, 1000 - timeUntilLaunch / 60000);
                //    const t = d3.now() % 3000 / 3000;
                //    const color = d3.interpolateRgb("rgb(255, 0, 0)", "rgb(0, 0, 255)")(t);
                //    nextLaunchDot.transition()
                //        .duration(blinkRate / 2)
                //        .attr('opacity', 0)
                //        .transition()
                //        .duration(blinkRate / 2)
                //        .attr('opacity', 1)
                //        .attr('fill', color)
                //        .on('end', blinkNextLaunch);
                //}
                //
                //blinkNextLaunch();
            }

            function rotateGlobe() {
                const rotation = projection.rotate();
                rotation[0] += 0.3;
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

    // Add RGB border effect to match the globe point
    const colors = [
        '#ff0000', // Red
        '#ff00ff', // Magenta
        '#0000ff', // Blue
        '#00ffff', // Cyan
        '#00ff00', // Green
        '#ffff00', // Yellow
        '#ff0000'  // Back to red
    ];

    const colorScale = d3.scaleLinear()
        .domain(d3.range(colors.length).map(d => d / (colors.length - 1)))
        .range(colors)
        .interpolate(d3.interpolateRgb);

    let startTime = Date.now();
    
    function updateBorder() {
        const elapsed = Date.now() - startTime;
        const t = (elapsed % 3000) / 3000; // 3 second cycle
        card.style.borderColor = colorScale(t);
        requestAnimationFrame(updateBorder);
    }

    updateBorder();

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

function drawStackedBarChart(data) {
    const svg = d3.select("#stacked-bar-chart");
    const width = 800;
    const height = 400;
    const margins = { top: 20, right: 30, bottom: 50, left: 60 };

    svg.attr("width", width).attr("height", height);

    const countries = Object.keys(data);
    const missionTypes = ["Suborbital", "LEO", "MEO", "Geosynchronous", "DeepSpace"];

    // Prepare data for stacking
    const series = d3.stack()
        .keys(missionTypes)
        .value((d, key) => d[1][key])
        (Object.entries(data));

    const x = d3.scaleBand()
        .domain(countries)
        .range([margins.left, width - margins.right])
        .padding(0.1);

    const y = d3.scaleLinear()
        .domain([0, d3.max(series, s => d3.max(s, d => d[1]))]).nice()
        .range([height - margins.bottom, margins.top]);

    const color = d3.scaleOrdinal()
        .domain(missionTypes)
        .range(d3.schemeCategory10);

    svg.append("g")
        .selectAll("g")
        .data(series)
        .join("g")
        .attr("fill", d => color(d.key))
        .selectAll("rect")
        .data(d => d)
        .join("rect")
        .attr("x", d => x(d.data[0]))
        .attr("y", d => y(d[1]))
        .attr("height", d => y(d[0]) - y(d[1]))
        .attr("width", x.bandwidth());

    svg.append("g")
        .attr("transform", `translate(0,${height - margins.bottom})`)
        .call(d3.axisBottom(x).tickSizeOuter(0))
        .selectAll("text")
        .attr("transform", "rotate(-45)")
        .style("text-anchor", "end");

    svg.append("g")
        .attr("transform", `translate(${margins.left},0)`)
        .call(d3.axisLeft(y));

    // Legend
    const legend = svg.append("g")
        .attr("transform", `translate(${width - margins.right}, ${margins.top})`)
        .selectAll("g")
        .data(missionTypes.slice().reverse())
        .enter().append("g")
        .attr("transform", (d, i) => `translate(0,${i * 20})`);

    legend.append("rect")
        .attr("x", -19)
        .attr("width", 19)
        .attr("height", 19)
        .attr("fill", color);

    legend.append("text")
        .attr("x", -24)
        .attr("y", 9.5)
        .attr("dy", "0.32em")
        .text(d => d);
}

document.addEventListener('DOMContentLoaded', fetchLaunchData);