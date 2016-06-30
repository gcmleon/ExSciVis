#version 150
//#extension GL_ARB_shading_language_420pack : require
#extension GL_ARB_explicit_attrib_location : require

#define TASK 10
#define ENABLE_OPACITY_CORRECTION 0
#define ENABLE_LIGHTNING 0
#define ENABLE_SHADOWING 0

in vec3 ray_entry_position;

layout(location = 0) out vec4 FragColor;

uniform mat4 Modelview;

uniform sampler3D volume_texture;
uniform sampler2D transfer_texture;


uniform vec3    camera_location;
uniform float   sampling_distance;
uniform float   sampling_distance_ref;
uniform float   iso_value;
uniform vec3    max_bounds;
uniform ivec3   volume_dimensions;

uniform vec3    light_position;
uniform vec3    light_ambient_color;
uniform vec3    light_diffuse_color;
uniform vec3    light_specular_color;
uniform float   light_ref_coef;


bool
inside_volume_bounds(const in vec3 sampling_position)
{
    return (   all(greaterThanEqual(sampling_position, vec3(0.0)))
            && all(lessThanEqual(sampling_position, max_bounds)));
}


float
get_sample_data(vec3 in_sampling_pos)
{
    vec3 obj_to_tex = vec3(1.0) / max_bounds;
    return texture(volume_texture, in_sampling_pos * obj_to_tex).r;

}

vec3
get_gradient(vec3 in_sampling_pos)
{

	float step_x = 1.0 / volume_dimensions.x;
	float step_y = 1.0 / volume_dimensions.y;
	float step_z = 1.0 / volume_dimensions.z;

	// X axis
	float gx = (get_sample_data(vec3(in_sampling_pos.x + step_x, in_sampling_pos.y, in_sampling_pos.z)) - get_sample_data(vec3(in_sampling_pos.x - step_x, in_sampling_pos.y, in_sampling_pos.z))) / 2;
	// Y axis
	float gy = (get_sample_data(vec3(in_sampling_pos.x, in_sampling_pos.y + step_y, in_sampling_pos.z)) - get_sample_data(vec3(in_sampling_pos.x, in_sampling_pos.y - step_y, in_sampling_pos.z))) / 2;
	// Z axis
	float gz = (get_sample_data(vec3(in_sampling_pos.x, in_sampling_pos.y, in_sampling_pos.z + step_z)) - get_sample_data(vec3(in_sampling_pos.x, in_sampling_pos.y, in_sampling_pos.z - step_z))) / 2;

	vec3 gradient = vec3(gx, gy, gz);
	//float magnitude = sqrt(gx*gx + gy*gy + gz*gz);

	return gradient;
}

float
shadow_calculation(vec3 in_sampling_pos)
{

	// get sample
    float s = get_sample_data(in_sampling_pos);
    // apply the transfer functions to retrieve color and opacity
    vec4 color = texture(transfer_texture, vec2(s, s));
    // perform perspective divide
    vec3 projCoords = color.xyz / color.w;
    // Transform to [0, 1] range
    projCoords = projCoords * 0.5 + 0.5;
    // Get closest depth value from light's perspective (using [0,1] range fragPosLight as coords)
    float closestDepth = texture(transfer_texture, projCoords.xy).r; 
    // Get depth of current fragment from light's perspective
    float currentDepth = projCoords.z;
    // Check whether current frag pos is in shadow
    float shadow = currentDepth > closestDepth  ? 1.0 : 0.0;

    return shadow;
}

// possibly helpful by compositing
vec4
front_to_back_traversal(vec4 intensity, float opacity)
{
	vec4 accumulated_intensity = (1 - opacity) * intensity;
	return accumulated_intensity;
}


void main()
{
    /// One step trough the volume
    vec3 ray_increment      = normalize(ray_entry_position - camera_location) * sampling_distance;
    /// Position in Volume
    vec3 sampling_pos       = ray_entry_position + ray_increment; // test, increment just to be sure we are in the volume

    /// Init color of fragment
    vec4 dst = vec4(0.0, 0.0, 0.0, 0.0);

	// Normal vector
	vec3 N = vec3(0.0);

    /// check if we are inside volume
    bool inside_volume = inside_volume_bounds(sampling_pos);
    
    if (!inside_volume)
        discard;

#if TASK == 10
    vec4 max_val = vec4(0.0, 0.0, 0.0, 0.0);
    
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume) 
    {      
        // get sample
        float s = get_sample_data(sampling_pos);
                
        // apply the transfer functions to retrieve color and opacity
        vec4 color = texture(transfer_texture, vec2(s, s));
           
        // this is the example for maximum intensity projection
        max_val.r = max(color.r, max_val.r);
        max_val.g = max(color.g, max_val.g);
        max_val.b = max(color.b, max_val.b);
        max_val.a = max(color.a, max_val.a);
        
        // increment the ray sampling position
        sampling_pos  += ray_increment;

        // update the loop termination condition
        inside_volume  = inside_volume_bounds(sampling_pos);
    }

    dst = max_val;
#endif
    
#if TASK == 11
	int i = 0;
    vec4 avg_val = vec4(0.0, 0.0, 0.0, 0.0);

    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume)
    {      
        // get sample
        float s = get_sample_data(sampling_pos);
                
        // apply the transfer functions to retrieve color and opacity
        vec4 color = texture(transfer_texture, vec2(s, s));

        // average intensity projection
        avg_val.r = avg_val.r + color.r;
        avg_val.g = avg_val.g + color.g;
        avg_val.b = avg_val.b + color.b;
        avg_val.a = avg_val.a + color.a; // not ideal, individual characteristics are lost
		i = i + 1;
        
        // increment the ray sampling position
        sampling_pos  += ray_increment;

        // update the loop termination condition
        inside_volume  = inside_volume_bounds(sampling_pos);
    }
	
    avg_val.r = avg_val.r/i;
    avg_val.g = avg_val.g/i;
    avg_val.b = avg_val.b/i;
    avg_val.a = avg_val.a/i;

	dst = avg_val;
#endif
    
#if TASK == 12 || TASK == 13

	float prev_s = 0.0;
	int iterations = 400;
	int i = 0;
	float sigma = 0.00000001;
	vec3 left = vec3(0.0);
	vec3 right = vec3(0.0);
	float s_mid = 0.0;
	bool found = false;
	vec4 showing_color = vec4(0.0, 0.0, 0.0, 1.0);
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume)
    {
        // get sample
		float s = get_sample_data(sampling_pos);

		// apply the transfer functions to retrieve color and opacity
		vec4 color = texture(transfer_texture, vec2(s, s));

		vec3 mid = sampling_pos;

		// First hit
		if ((s > iso_value)) {
			showing_color = color;
			//N = normalize(get_gradient((mid).xyz)); // to show normals
		

#if TASK == 13 
			// Binary Search
			left = sampling_pos - ray_increment;
			right = sampling_pos;
			s_mid = s;

			i = 0;
			found = false;

			while (i < iterations && !found) {
				
				mid = (right + left)/2;
				s_mid = get_sample_data(mid);

				if (abs(s_mid - iso_value) < sigma) {
					found = true;
					break;
				} else {
					if (s_mid > iso_value) {
						right = mid;
					}
					else {
						left = mid;
					}
				}
				i = i + 1;
			}
			showing_color = texture(transfer_texture, vec2(s_mid, s_mid));
			//N = normalize(get_gradient((mid).xyz)); // to show normals

#endif
			//showing_color = vec4(N / 2 + 0.5, 1.0);
			
#if ENABLE_LIGHTNING == 1 // Add Shading

		const float ka = 0.5;
		const float kd = 0.5;
		const float ks = 0.5;
	
		const vec3 specular = vec3(1.0, 3.0, 3.0);
		const float exponent = 5.0;

		//normalize vectors after interpolation
		vec3 N = normalize(get_gradient((mid).xyz));
		vec3 L = normalize((light_position - mid).xyz);
		vec3 V = normalize((-ray_increment).xyz);

		vec3 halfWayDir = normalize(light_position.xyz + camera_location.xyz);

		float spec = ks * pow(max(0.0, dot(N, halfWayDir)), exponent);

		float diffuse = kd * max(dot(N, L), 0.0);
		diffuse = clamp(diffuse, 0.0, 1.0);

		// With ambient light
		showing_color = vec4((ka + diffuse + spec) * showing_color.xyz, 1.0); 

		// Without ambient light
		//showing_color = vec4((diffuse + spec) * showing_color.xyz, 1.0); 

		// Code taken from: http://learnopengl.com/#!Advanced-Lighting/Advanced-Lighting
		// http://sunandblackcat.com/tipFullView.php?l=eng&topicid=30&topic=Phong-Lighting
   

#if ENABLE_SHADOWING == 1 // Add Shadows
        float shadow = shadow_calculation(mid);
        // With ambient Light
        showing_color = vec4((ka + (1.0 - shadow) * (diffuse + spec)) * showing_color.xyz, 1.0);

        // Without ambient light
        //showing_color = vec4(((1.0 - shadow) * (diffuse + spec)) * showing_color.xyz, 1.0);  
 
#endif
#endif
		break;
		}
		prev_s = s;

		// increment the ray sampling position
		sampling_pos += ray_increment;

        // update the loop termination condition
        inside_volume = inside_volume_bounds(sampling_pos);
    }
		
	dst = showing_color;
#endif 
	
// http://http.developer.nvidia.com/GPUGems/gpugems_ch39.html
#if TASK == 31
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume)
    {
        // get sample
#if ENABLE_OPACITY_CORRECTION == 1 // Opacity Correction
        IMPLEMENT;
#else
        float s = get_sample_data(sampling_pos);
#endif
        // dummy code
        dst = vec4(light_specular_color, 1.0);

        // increment the ray sampling position
        sampling_pos += ray_increment;

#if ENABLE_LIGHTNING == 1 // Add Shading
		IMPLEMENT;
#endif

        // update the loop termination condition
        inside_volume = inside_volume_bounds(sampling_pos);
    }
#endif 

    // return the calculated color value
	FragColor = dst;
}

