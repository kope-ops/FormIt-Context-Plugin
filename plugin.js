(function() {

    const constants = {
        apiTimeout: 25,
        convertMetersToFeet: 1 
    }

    /**
     *  Get the numeric value of an input element. Defaults to 1.
     * @param {string} id - The id of the input element
     * @returns {number}
     */
    const getInputNumberById = id => {
        const element = document.getElementById(id)
        const value = element !== null ? element.value : 0
        const number = Number(value)

        if(isNaN(number) || number === 0)
            throw `Failed to get input value of element #${id}`

        return number
    }

    /**
     *  Create 3D context
     */
    const create3DContext = async () => {  
        try {            
            // Get location info from FormIt        
            await updateCoordinatesFromLocation()

            displayMessage('Retrieved coordinates from location settings')

            // Disable 'Create' button until current operation is completed
            document.getElementById("CreateButton").disabled = true

            // Create an object of all the HTML <input> values
            const inputs = {                
                latitude: getInputNumberById("Latitude"),
                longitude: getInputNumberById("Longitude"),
                radius: getInputNumberById("Radius")
            }

            // https://www.openstreetmap.org/#map=17/51.50111/-0.12531
            const locationGeoPoint = turf.point([ inputs.longitude,inputs.latitude ])

            const locationGeoBbox = getBbox(locationGeoPoint, inputs.radius)

            // Get the data from the OpenStreetMaps API
            const osmData = await getOSMData(locationGeoBbox)

            // Convert the OpenStreetMaps data to GeoJSON
            const geoJsonData = osmtogeojson(osmData)

            const geoFeatures = geoJsonData.features.filter(feature => feature.geometry.type === "Polygon" ) 

            // Create FormIt geometry
            createFormItGeometry(geoFeatures, locationGeoPoint)

            document.getElementById("CreateButton").disabled = false
        }
        catch (e) {
            displayErrorMessage("An error has occured")
            displayErrorMessage(e)
            console.error("An error has occured", e)
        }
    }

    /**
     * Get the bounding box around the origin
     * @param {Object} locationGeoPoint - GeoJSON location point
     * @returns {Object} A turf.js bounding box
     */
    const getBbox = (locationGeoPoint, radius) => {
        const circle = turf.circle(locationGeoPoint, radius * 0.001, { steps: 4 })
        return turf.bbox(circle)
    }

    /** 
     * OpenStreetMap® data was used to generate this plugin: https://www.openstreetmap.org/copyright
     * @param {Object} bbox - Bounding box
     * @returns {Object} The OSM response as an awaitable JSON object
     */
    const getOSMData = async (bbox) => {
        const filters = [ "building" ]
        const endpoint = "http://overpass-api.de/api/interpreter"
        const bounds = `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`

        let query = `?data=[out:json][timeout:${constants.apiTimeout}][bbox:${bounds}];`
        if (filters.length > 0) {
            query += "("

            filters.forEach(filter => {
                query += `way[${filter}];`
                query += `relation[${filter}];`
            })

            query += ");"
        }
        query += "(._;>;);"
        query += "out;"

        const url = endpoint + query
        displayWarningMessage(`Sending API request. Depending on the info and square radius, this could take up to ${constants.apiTimeout} seconds`)
        
        const response = await fetch(url)
        if(response.ok)
            return response.json()
        throw `API request failed. ${response.status} ${response.statusText}`
    }

    /**
     * Create FormIt geometry
     * @param {Array} features - An array of GeoJSON features
     * @param {Object} center - GeoJSON location point
     * @returns {Array} FormIt extrusions
     */
    const createFormItGeometry = async (features, center) => {
        // Create a new history ID and store it in the plugin state object
        const historyID = await FormIt.GroupEdit.GetEditingHistoryID()
        
        //Create group for the context group under current history ID
        const allContextGroupID = await WSM.APICreateGroup(historyID, [])

        //History ID for the context group
        const allContextGroupHistoryID= await WSM.APIGetGroupReferencedHistoryReadOnly(historyID, allContextGroupID)

        // Loop through each feature
        const geometryFormIt = Promise.all(features.map(async feature => {
            const storeyHeight = 12 //12 feet (average floor size)
            let height = storeyHeight

            if(!_.isUndefined(feature.properties.building))
                height = feature.properties.height

            if(!_.isUndefined(feature.properties["building:levels"]))
                height = feature.properties["building:levels"] * storeyHeight

            else 
                height = storeyHeight

            // Convert each GeoJSON polygon to an array of FormIt points
            const polygonsFormIt = feature.geometry.coordinates.map(async (polygon, index,points) => 
                {
                    return Promise.all(polygon.map( vertex => 
                        {
                            const vertexFeet = CoordinateLocationToFeet(vertex,center.geometry.coordinates)
                        return WSM.Geom.Point3d(vertexFeet[0], vertexFeet[1], 0)
                         }))
                })             

            //start undo manager state - this should suspend WSM and other updates to make this faster
            FormIt.UndoManagement.BeginState() 

            //empty group in main group history
            const groupID = await WSM.APICreateGroup(allContextGroupHistoryID,[])             

            //history of the group, history to put buildings into
            const groupHistoryID = await WSM.APIGetGroupReferencedHistoryReadOnly(allContextGroupHistoryID , groupID) 

            //connect each of these points in the array into a polyline
            await Promise.all(polygonsFormIt.map(async (points, index) => {                
                try {
                    const allPts = await points
                   
                    for(let i=0;i< allPts.length;i++)
                    {
                        let k = (i + 1 +  allPts.length) %  allPts.length 

                        //sketch all out into group history
                        const pl = WSM.APIConnectPoint3ds(groupHistoryID, allPts[i],  allPts[k])                                             
                    }
                }
                catch (e) {
                    throw 'Failed to create extrusion'
                }
            }))

            //get the first face generates by all the polylines
            const faces= await WSM.APIGetAllObjectsByTypeReadOnly(groupHistoryID, WSM.nObjectType.nFaceType);
            const aface = faces[0];

            //drag or extrude according to height
            await WSM.APIDragFace(groupHistoryID, aface, height )

            FormIt.UndoManagement.EndState("Created geometry")
        }))
        displayMessage(`Created ${(await geometryFormIt).length} features`)
    }

    const CoordinateLocationToFeet = (point, origin)=>
    {
        const pointX = turf.point([point[0], origin[1]])
        const pointY = turf.point([origin[0], point[1]])
        const options = {units: 'feet'};
        let distanceX = turf.distance(origin, pointX, options)
        let distanceY = turf.distance(origin, pointY, options)
        if (point[0]<origin[0]) distanceX = -distanceX
        if (point[1]<origin[1]) distanceY = -distanceY
        const coordinates = [distanceX,distanceY]
        return coordinates
    }

    /**
     *  Find coordinates from address set by users
     */
    const updateCoordinatesFromLocation = async()=>
    {    
        //Get location info from FormIt    
        const location = await FormIt.SunAndLocation.GetLocationDateTime()
        const lat = location.latitude
        const long = location.longitude

        //update latitude and longitude to UI input field
        document.getElementById("Latitude").value = lat
        document.getElementById("Longitude").value = long      
    }

    /**
     *  Update bubble text on range slider
     */
    const allRanges = document.querySelectorAll(".range-wrap")

    allRanges.forEach(wrap =>
        {
            const range = wrap.querySelector(".range")
            const bubble = wrap.querySelector(".bubble")
  
            range.addEventListener("input", () =>
            {
              setBubble(range, bubble)
            })
              
            setBubble(range, bubble)
        })
  
    function setBubble(range, bubble) 
    {
        const val = range.value
        const min = range.min ? range.min : 0
        const max = range.max ? range.max : 100
        const newVal = Number(((val - min) * 100) / (max - min))
        bubble.innerHTML = val
          
        // Sorta magic numbers based on size of the native UI thumb
        bubble.style.left = `calc(${newVal}% + (${8 - newVal * 0.15}px))`
    }

    // Show messages with FormIt popUp
    const displayMessage = async message =>
    {        
        await FormIt.UI.ShowNotification(message, FormIt.NotificationType.Information, 0);
    }

    const displayWarningMessage = async message =>
    {        
        await FormIt.UI.ShowNotification(message, FormIt.NotificationType.Warning, 0);
    }

    const displayErrorMessage = async message =>
    {        
        await FormIt.UI.ShowNotification(message, FormIt.NotificationType.Error, 0);
    }

    // Trigger execute when the create button is clicked
    document.getElementById("CreateButton").addEventListener("click", create3DContext)
}());
